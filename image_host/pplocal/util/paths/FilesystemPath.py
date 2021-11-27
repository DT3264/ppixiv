import os
from pathlib import Path, PurePosixPath
from .. import win32

from .PathBase import PathBase
from .ZipPath import ZipPath

class FilesystemPath(PathBase):
    @classmethod
    def _open_zip(cls, path):
        """
        See if path is a ZIP, or a file inside a ZIP.  Return a ZipPath to the file,
        or None otherwise.
        """
        path = Path(path)

        zip_parts = path.parts
        filename_parts = []
        while zip_parts and not zip_parts[-1].lower().endswith('.zip'):
            filename_parts.append(zip_parts[-1])
            zip_parts = zip_parts[:-1]
        if not zip_parts:
            return None

        zip_path = Path('/'.join(zip_parts))
        filename_path = PurePosixPath('/'.join(filename_parts))
        if not filename_path:
            filename_path = '/'
        if not zip_path.is_file():
            return None

        file = FilesystemPath(zip_path)
        zip_path = ZipPath.open_zip(file)
        for part in reversed(filename_parts):
            zip_path = zip_path / part

        return zip_path

    def __init__(self, path, *, direntry=None, open_zips=False):
        """
        If this FilesystemPath is being created while iterating a parent directory, direntry
        will be the DirEntry from os.scandir.  This is used to speed up file operations.
        """
        # XXX: check performance of Path ctor in refreshes
        self._path = Path(path)
        self.stat_cache = None
        self.direntry = direntry

    def __str__(self):
        return str(self._path)

    def __hash__(self):
        return hash(str(self))

    def __eq__(self, rhs):
        if not isinstance(rhs, FilesystemPath):
            return False

        return self._path == rhs._path

    @property
    def path(self):
        return self._path

    @property
    def name(self):
        return self._path.name

    def __eq__(self, rhs):
        return self._path  == rhs

    def __fspath__(self):
        return self._path.__fspath__()
    
    def __truediv__(self, name):
        return FilesystemPath(self._path / name)

    def exists(self):
        if self.direntry is not None:
            return True
        else:
            return self._path.exists()

    @property
    def suffix(self):
        return self._path.suffix

    @property
    def parts(self):
        return self._path.parts

    def is_file(self):
        if self.direntry is not None:
            return self.direntry.is_file(follow_symlinks=False)
        else:
            return self._path.is_file()

    def is_dir(self):
        # If this is a ZIP, treat it like a directory.
        if self._is_zip():
            return True

        if self.direntry is not None:
            return self.direntry.is_dir(follow_symlinks=False)
        else:
            return self._path.is_dir()

    def _is_zip(self):
        return self.is_file() and self._path.suffix.lower().endswith('.zip')

    def with_name(self, name):
        return FilesystemPath(self._path.with_name(name))

    @property
    def real_file(self):
        # If this is a ZIP, we're treating it like a directory and listing its contents
        # lists the files inside the ZIP.  Don't return the path to the ZIP on disk when
        # we're doing this.  For example, metadata_storage depends on this.
        if self._is_zip():
            return None

        return self._path

    @property
    def filesystem_path(self):
        return self._path

    @property
    def filesystem_parent(self):
        return self._path.parent

    def stat(self):
        if self.direntry is not None:
            return self.direntry.stat()
        elif self.stat_cache is not None:
            return self.stat_cache
        else:
            self.stat_cache = self._path.stat()
            return self.stat_cache

    def iterdir(self):
        for path in os.scandir(self._path):
            yield FilesystemPath(Path(path.path), direntry=path)

    def open(self, mode='r', *, shared=True):
        if shared:
            return win32.open_shared(os.fspath(self._path), mode)
        else:
            return open(os.fspath(self._path), mode)
