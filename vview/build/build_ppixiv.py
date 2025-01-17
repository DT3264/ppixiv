import argparse, base64, collections, errno, glob, hashlib, mimetypes, json, io, os, random, re, sys, string, subprocess, tempfile
import urllib.parse
from . import util
from pathlib import Path
from pprint import pprint

# This builds a user script that imports each filename directly from the build
# tree.  This can be used during development: you can edit files and refresh a
# page without having to build the script or install it.

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/scss', '.scss')
mimetypes.add_type('application/x-font-woff', '.woff')

_git_tag = None
def get_git_tag():
    """
    Return the current git tag.
    """
    global _git_tag
    if _git_tag is not None:
        return _git_tag
        
    result = subprocess.run(['git', 'describe', '--tags', '--dirty', '--match=r*'], capture_output=True)
    _git_tag = result.stdout.strip().decode()

    # Work around TamperMonkey's broken attempts at parsing versions: it interprets a
    # standard git devel tag like "100-10" as "major version 100, minor version negative 10" and
    # fails to update.  Work around this by changing these tags from "r100-10-abcdef-dirty" to
    # "r100.10.abcdef.dirty".
    #
    # You should never parse version numbers as if the entire world uses the same versioning scheme
    # that you do.  It should only check if the version is different and update if it changes, without
    # trying to figure out if it's newer or older.  If the version is older you should update to it
    # anyway, since if a script author rolled back a script update, it was probably for a reason.
    #
    # This only affects development versions.  Release versions are just "r123", which it doesn't have
    # problems with.
    _git_tag = _git_tag.replace('-', '.')

    return _git_tag

def to_javascript_string(s):
    """
    Return s as a JavaScript string.
    """
    escaped = re.sub(r'''([`$\\])''', r'\\\1', s)

    # This is a hopefully temporary workaround for "Stay" to stop it from stripping our
    # comments by replacing "//" in source code strings with "/\\x2f":
    #
    # https://github.com/shenruisi/Stay/issues/60
    escaped = escaped.replace('//', '/\\x2f')
    return '`%s`' % escaped

class Build(object):
    # Source maps will point to here:
    github_root = 'https://raw.githubusercontent.com/ppixiv/ppixiv/'

    # Info for deployment.  If you're just building locally, these won't be used.
    deploy_s3_bucket = 'ppixiv'
    distribution_root = f'https://ppixiv.org'

    @classmethod
    def build(cls):
        parser = argparse.ArgumentParser()
        parser.add_argument('--deploy', '-d', action='store_true', default=False, help='Deploy a release version')
        parser.add_argument('--latest', '-l', action='store_true', default=False, help='Point latest at this version')
        parser.add_argument('--url', '-u', action='store', default=None, help='Location of the debug server for ppixiv-debug')
        args = parser.parse_args()

        # This is a release if it has a tag and the working copy is clean.
        result = subprocess.run(['git', 'describe', '--tags', '--match=r*', '--exact-match'], capture_output=True)
        is_tagged = result.returncode == 0

        result = subprocess.run(['git', 'status', '--porcelain', '--untracked-files=no'], capture_output=True)
        is_clean = len(result.stdout) == 0

        is_release = is_tagged and is_clean
        debug_server_url = None

        if len(sys.argv) > 1 and sys.argv[1] == '--release':
            is_release = True

        if is_release:
            git_tag = get_git_tag()
        else:
            git_tag = None

        if is_release:
            print('Release build: %s' % git_tag)
        else:
            reason = []
            if not is_clean:
                reason.append('working copy dirty')
            if not is_tagged:
                reason.append('no tag')
            print('Development build: %s' % ', '.join(reason))

        try:
            os.makedirs('output')
        except OSError as e:
            # Why is os.makedirs "create all directories, but explode if the last one already
            # exists"?
            if e.errno != errno.EEXIST:
                raise

        build = cls()

        # Before building, download dart-sass if needed.  This lets the ppixiv build work
        # if vview isn't being used.
        build._download_sass()

        build.build_with_settings(is_release=is_release, git_tag=git_tag, deploy=args.deploy, latest=args.latest,
            debug_server_url=args.url)

    def _download_sass(self):
        """
        Download a dart-sass prebuilt into bin/dart-sass.
        """
        output_dir = self.root / 'bin' / 'dart-sass'
        util.download_sass(output_dir)

    def build_with_settings(self, *, is_release=False, git_tag='devel', deploy=False, latest=False, debug_server_url=None):
        self.is_release = is_release
        self.git_tag = git_tag
        self.distribution_url = f'{self.distribution_root}/builds/{get_git_tag()}'

        self.build_release()
        self.build_debug(debug_server_url)
        if deploy:
            self.deploy(latest=latest)

    def deploy(self, latest=False):
        """
        Deploy the distribution to the website.
        """
        def copy_file(source, path, output_filename=None):
            if output_filename is None:
                output_filename = os.path.basename(source)
            subprocess.check_call([
                'aws', 's3', 'cp',
                '--acl', 'public-read',
                source,
                f's3://{self.deploy_s3_bucket}/{path}/{output_filename}',
            ])

        if not self.is_release:
            # If we're deploying a dirty build, just copy the full build to https://ppixiv.org/beta
            # for quick testing.  Don't clutter the build directory with "r123-dirty" builds.
            print('Deploying beta only')
            copy_file('output/ppixiv.user.js', 'beta')
            copy_file('output/ppixiv-main.user.js', 'beta')
            return

        # Copy files for this version into https://ppixiv.org/builds/r1234.
        version = get_git_tag()
        for filename in ('ppixiv.user.js', 'ppixiv-main.user.js'):
            copy_file(f'output/{filename}', f'builds/{version}')

        # Update the beta to point to this build.
        copy_file('output/ppixiv.user.js', 'beta')

        if latest:
            # Copy the loader to https://ppixiv.org/latest:
            copy_file('output/ppixiv.user.js', 'latest')

    def build_release(self):
        """
        Build the final output/ppixiv.user.js script.
        """
        # Generate the main script.  This can be installed directly, or loaded by the
        # loader script.
        output_file = 'output/ppixiv-main.user.js'
        print('Building: %s' % output_file)

        data = self.build_output()
        data = data.encode('utf-8')
        sha256 = hashlib.sha256(data).hexdigest()

        with open(output_file, 'w+b') as output_file:
            output_file.write(data)

        # Generate the loader script.  This is intended for use on GreasyFork so we can update
        # the script without pushing a 1.5MB update each time, and so we won't eventually run
        # into the 2MB size limit.
        output_loader_file = 'output/ppixiv.user.js'
        print('Building: %s' % output_loader_file)
        result = self.build_header(for_debug=False)

        # Add the URL where the above script will be available.  If this is a release, it'll be
        # in the regular distribution directory with the release in the URL.  If this is a debug
        # build, we only keep the latest version around in /beta.
        if self.is_release:
            main_url = f'{self.distribution_url}/ppixiv-main.user.js'
        else:
            main_url = f'{self.distribution_root}/beta/ppixiv-main.user.js'

        result.append(f'// @require     {main_url}#sha256={sha256}')
        result.append(f'// ==/UserScript==')

        # Add a dummy statement.  Greasy Fork complains about "contains no executable code" if there's
        # nothing in the top-level script, since it doesn't understand that all of our code is in a
        # @require.
        result.append('(() => {})();')

        data = '\n'.join(result) + '\n'
        data = data.encode('utf-8')
        with open(output_loader_file, 'w+b') as output_file:
            output_file.write(data)

    def build_debug(self, debug_server_url=None):
        if debug_server_url is None:
            debug_server_url = 'http://localhost:8235'

        output_file = 'output/ppixiv-debug.user.js'
        print('Building: %s' % output_file)

        result = self.build_header(for_debug=True)
        result.append(f'// ==/UserScript==')

        # Add the loading code for debug builds, which just runs bootstrap_native.js.
        result.append('''
// Load and run the bootstrap script.  Note that we don't do this with @require, since TamperMonkey caches
// requires overly aggressively, ignoring server cache headers.  Use sync XHR so we don't allow the site
// to continue loading while we're setting up.
(() => {
    // If this is an iframe, don't do anything.
    if(window.top != window.self)
        return;

    let rootUrl = %(url)s;
    let xhr = new XMLHttpRequest();
    xhr.open("GET", `${rootUrl}/vview/startup/bootstrap.js`, false);
    xhr.send();

    let startup = eval(xhr.responseText);
    startup({rootUrl});
})();
        ''' % { 'url': json.dumps(debug_server_url) })

        lines = '\n'.join(result) + '\n'

        with open(output_file, 'w+t', encoding='utf-8', newline='\n') as f:
            f.write(lines)

    @property
    def root(self):
        return Path(os.getcwd())

    def get_local_root_url(self):
        """
        Return the file:/// path containing local source.

        This is only used for development builds.
        """
        return self.root.as_uri()

    def get_source_root_url(self, filetype='source'):
        """
        Return the URL to the top of the source tree, which source maps point to.
        
        This is used in used in sourceURL, and the URLs source maps point to.  In development,
        this is a file: URL pointing to the local source tree.  For releases, this points to
        the tag on GitHub for this release.
        """
        if self.is_release:
            return self.github_root + self.git_tag
        else:
            return self.get_local_root_url()

    def get_resource_list(self):
        results = collections.OrderedDict()
        resource_path = Path('web/resources')
        files = list(resource_path.glob('**/*'))
        files.sort()
        for path in files:
            path = Path(path)
            name = path.relative_to(resource_path)
            results['resources/' + name.as_posix()] = path

        return results

    def _make_temp_path(self):
        """
        Create a reasonably unique filename for a temporary file.

        tempfile insists on creating the file and doesn't give us a way to simply generate
        a filename, which is what's needed when we're passing a filename to a subprocess.
        """
        fn = ''.join(random.choice(string.ascii_lowercase) for _ in range(10))
        return Path(tempfile.gettempdir()) / ('vview-' + fn)

    def build_css(self, path, embed_source_root=None):
        if embed_source_root is None:
            embed_source_root = self.get_source_root_url()

        path = path.resolve()

        # The path to dart-sass:
        dart_path = self.root / 'bin' / 'dart-sass'
        dart_exe = dart_path / 'dart'
        sass = dart_path / 'sass.snapshot'

        output_css = self._make_temp_path().with_suffix('.css')
        output_map = output_css.with_suffix('.css.map')

        # Run dart-sass.  We have to output to temporary files instead of reading stdout,
        # since it doesn't give any way to output the CSS and source map separately that way.
        dart_args = [
            dart_exe, sass,
        ]

        try:
            result = subprocess.run(dart_args + [
                '--no-embed-source-map',
                str(path),
                str(output_css),
            ], capture_output=True)
        except FileNotFoundError as e:
            # If dart-sass doesn't exist in bin/dart-sass, it probably hasn't been downloaded.  Run
            # vview.build.build_vview first at least once to download it.
            raise Exception(f'dart-sass not found in {dart_path}') from None

        if result.returncode:
            # Errors from dart are printed to stderr, but errors from SASS itself go to
            # stdout.
            output = result.stderr.decode("utf-8").strip()
            if not output:
                output=result.stdout.decode("utf-8").strip()

            raise Exception(f'Error building {path}: {output}')

        # Read the temporary files, then clean them up.
        with open(output_css, 'rt', encoding='utf-8') as f:
            data = f.read()

        with open(output_map, 'rt', encoding='utf-8') as f:
            source_map = f.read()

        output_css.unlink()
        output_map.unlink()

        # dart-sass doesn't let us tell it the source root.  They expect us to decode it and
        # fix it ourself.  It's pretty obnoxious to have to jump a bunch of hoops because they
        # couldn't be bothered to just let us pass in a URL and tell it where the top path is.
        #
        # We expect all CSS files to be inside the web/resources directory, eg:
        #
        # file:///c:/files/ppixiv/web/resources/main.scss
        #
        # Map these so they're relative to the root, and set sourceRoot to embed_source_root.
        source_map = json.loads(source_map)
        expected_wrong_url = self.get_local_root_url() + '/web'
        if not expected_wrong_url.endswith('/'):
            expected_wrong_url += '/'

        def fix_url(url):
            # Resolve the path relative to the CSS file.
            url = str(urllib.parse.urljoin(output_css.as_uri(), url))

            # The path inside the map is relative to the CSS file, so is relative to 
            if not url.startswith(expected_wrong_url):
                raise Exception(f'Expected CSS source map URL {url} to be inside {expected_wrong_url}')
            return url[len(expected_wrong_url):]
        
        source_map['sources'] = [fix_url(url) for url in source_map['sources']]
        source_map['sourceRoot'] = embed_source_root

        # Fix the filename, so it doesn't contain the temporary filename.
        source_map['file'] = Path(path).relative_to(self.root).as_posix()

        # Reserialize the source map.
        source_map = json.dumps(source_map, indent=0)

        # Compounding the above problem: if you tell it not to embed the source map, it appends
        # the sourceMappingURL, and there's no way to tell it not to, so we have to find it and
        # strip it off.
        lines = data.split('\n')
        assert lines[-2].startswith('/*# sourceMappingURL')
        assert lines[-1] == ''
        lines[-2:-1] = []
        data = '\n'.join(lines)

        # Embed our fixed source map.
        encoded_source_map = base64.b64encode(source_map.encode('utf-8')).decode('ascii')
        data += '/*# sourceMappingURL=data:application/json;base64,%s */' % encoded_source_map

        return data

    def build_header(self, for_debug):
        result = []
        with open('web/startup/header.js', 'rt', encoding='utf-8') as input_file:
            for line in input_file.readlines():
                line = line.strip()

                # Change the name of the testing script so it can be distinguished in the script dropdown.
                if line.startswith('// @name ') and for_debug:
                    line += ' (testing)'

                result.append(line)

        # Add @version.
        if for_debug:
            version = 'testing'
        else:
            version = self.get_release_version()
            
        result.append('// @version     %s' % version)

        return result

    def get_release_version(self):
        version = get_git_tag()

        # Release tags look like "r100".  Remove the "r" from the @version.
        assert version.startswith('r')
        version = version[1:]

        return version

    @classmethod
    def get_modules(cls):
        """
        Return a dict of source modules, mapping from the module name to a path.
        """
        modules = {}
        modules_top = Path('web/vview')
        for root, dirs, files in os.walk(modules_top):
            for file in files:
                # Ignore dotfiles.
                if file.startswith('.'):
                    continue

                # web/vview/module/path.js -> vview/module/path.js
                path = Path(root) / file

                # Don't include app-startup.js as a module.  It's the entry point that loads
                # the modules.
                if path.as_posix() == 'web/vview/app-startup.js':
                    continue

                relative_path = path.relative_to(modules_top)
                module_name = 'vview' / relative_path
                module_path = '/' + module_name.as_posix()
                modules[module_path] = path

        return modules

    def build_output(self):
        result = self.build_header(for_debug=False)
        result.append(f'// ==/UserScript==')

        # Encapsulate the script.
        result.append('(function() {\n')

        result.append('let env = {};')
        result.append(f'env.version = "{self.get_release_version()}";')
        result.append('env.resources = {};\n')

        # Find modules, and add their contents as resources.
        modules = self.get_modules()

        # Add source modules.
        result.append('env.modules = {')
        for module_name, path in modules.items():
            with path.open('rt', encoding='utf-8') as input_file:
                script = input_file.read()

                # app-startup is inside the application, but it's not a module.  It'll be added
                # separately below.
                # XXX remove
                if module_name == 'vview/app-startup.js':
                    continue

                script += '\n//# sourceURL=%s/%s\n' % (self.get_source_root_url(), path.as_posix())
                script = to_javascript_string(script)

                # "name": loadBlob("mime type", "source"),
                result.append(f'    {json.dumps(module_name)}: loadBlob({json.dumps("application/javascript")},\n{script}),')

        result.append('};\n')

        # Add resources.
        for name, path in self.get_resource_list().items():
            name = name.replace('\\', '/')

            mime_type, encoding = mimetypes.guess_type(path)
            if mime_type is None:
                raise Exception(f'{path}: MIME type unknown')

            if mime_type in ('image/png', 'application/x-font-woff', 'application/octet-stream'):
                # Encode binary files as data: URLs.
                data = path.open('rb').read()
                data = 'data:%s;base64,%s' % (mime_type, base64.b64encode(data).decode('ascii'))
                result.append('''env.resources["%s"] = "%s";''' % (name, data))
                continue

            if path.suffix == '.scss':
                data = self.build_css(path)
                path = path.with_suffix('.css')
                name = name.replace('.scss', '.css')
            else:
                data = path.open('rt', encoding='utf-8').read()

            # Avoid base64-encoding text files, so we keep the script readable, and use
            # to_javascript_string instead of JSON to avoid ugly escaping.
            string = to_javascript_string(data)

            result.append(f'''env.resources["{name}"] = loadBlob("{mime_type}", {string});''')

        # Add app-startup directly without loading it into a blob.
        path = Path('web/vview/app-startup.js')
        with path.open('rt', encoding='utf-8') as input_file:
            script = input_file.read()
            script += '\n//# sourceURL=%s/%s\n' % (self.get_source_root_url(), path.as_posix())
            script = to_javascript_string(script)
            result.append(f'env.startup =\n{script};')

        result.append('env.init = { };\n')
        result.append(f'' +
'function loadBlob(type, data) {\n' +
'    return URL.createObjectURL(new Blob([data], { type }))\n'
'}\n')

        # Add the bootstrap code directly.
        bootstrap = open('web/startup/bootstrap.js', 'rt', encoding='utf-8').read()
        result.append(bootstrap)
        result.append('Bootstrap({env});\n')

        result.append('})();\n')

        return '\n'.join(result) + '\n'

if __name__=='__main__':
    Build().build()

