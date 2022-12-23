// The "More..." dropdown menu shown in the options menu.

import { SettingsDialog, SettingsPageDialog } from 'vview/widgets/settings-widgets.js';
import { SendImagePopup } from 'vview/misc/send-image.js';
import { MenuOptionButton, MenuOptionToggle, MenuOptionToggleSetting } from 'vview/widgets/menu-option.js';
import { MutedTagsForPostDialog } from 'vview/widgets/mutes.js';
import Actions from 'vview/misc/actions.js';
import { IllustWidget } from 'vview/widgets/illust-widgets.js';
import { helpers } from 'vview/misc/helpers.js';
import LocalAPI from 'vview/misc/local-api.js';

export default class MoreOptionsDropdown extends IllustWidget
{
    get neededData() { return "partial"; }

    constructor({
        // If true, show less frequently used options that are hidden by default to reduce
        // clutter.
        showExtra=false,

        ...options
    })
    {
        super({...options,
            template: `
                <div class="more-options-dropdown">
                    <div class="options vertical-list" style="min-width: 13em;"></div>
                </div>
        `});


        this.showExtra = showExtra;
        this._menuOptions = [];
    }

    _createMenuOptions()
    {
        let optionBox = this.container.querySelector(".options");
        let sharedOptions = {
            container: optionBox,
            parent: this,
        };

        for(let item of this._menuOptions)
            item.container.remove();

        let menuOptions = {
            similarIllustrations: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Similar illustrations",
                    icon: "ppixiv:suggestions",
                    requiresImage: true,
                    onclick: () => {
                        this.parent.hide();

                        let [illustId] = helpers.mediaIdToIllustIdAndPage(this.mediaId);
                        let args = new helpers.args(`/bookmark_detail.php?illust_id=${illustId}#ppixiv?recommendations=1`);
                        helpers.navigate(args);
                    }
                });
            },
            similarArtists: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Similar artists",
                    icon: "ppixiv:suggestions",
                    requiresUser: true,
                    onclick: () => {
                        this.parent.hide();

                        let args = new helpers.args(`/discovery/users#ppixiv?user_id=${this.userId}`);
                        helpers.navigate(args);
                    }
                });
            },

            similarLocalImages: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Similar images",
                    icon: "ppixiv:suggestions",
                    requiresImage: true,
                    onclick: () => {
                        this.parent.hide();

                        let args = new helpers.args("/");
                        args.path = "/similar";
                        args.hashPath = "/#/";
                        let { id } = helpers.parseMediaId(this.mediaId);
                        args.hash.set("search_path", id);
                        helpers.navigate(args);
                    }
                });
            },
            
            similarBookmarks: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Similar bookmarks",
                    icon: "ppixiv:suggestions",
                    requiresImage: true,
                    onclick: () => {
                        this.parent.hide();

                        let [illustId] = helpers.mediaIdToIllustIdAndPage(this.mediaId);
                        let args = new helpers.args(`/bookmark_detail.php?illust_id=${illustId}#ppixiv`);
                        helpers.navigate(args);
                    }
                });
            },

            indexFolderForSimilaritySearch: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Index similarity",
                    icon: "ppixiv:suggestions",
                    hideIfUnavailable: true,
                    requires: ({mediaId}) => {
                        if(mediaId == null)
                            return false;

                        let { type } = helpers.parseMediaId(mediaId);
                        return type == "folder";
                    },

                    onclick: () => {
                        this.parent.hide();
                        LocalAPI.indexFolderForSimilaritySearch(this.mediaId);
                    }
                });
            },

            editMutes: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Edit mutes",

                    // Only show this entry if we have at least a media ID or a user ID.
                    requires: ({mediaId, userId}) => { return mediaId != null || userId != null; },

                    icon: "mat:block",

                    onclick: async () => {
                        this.parent.hide();
                        new MutedTagsForPostDialog({
                            mediaId: this.mediaId,
                            userId: this.userId,
                        });
                    }
                });
            },

            refreshImage: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Refresh image",
                    requiresImage: true,
                    icon: "mat:refresh",

                    onclick: async () => {
                        this.parent.hide();
                        ppixiv.mediaCache.refreshMediaInfo(this.mediaId);
                    }
                });
            },

            shareImage: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Share image",
                    icon: "mat:share",

                    // This requires an image and support for the share API.
                    requires: ({mediaId}) => {
                        if(navigator.share == null)
                            return false;
                        if(mediaId == null || helpers.isMediaIdLocal(mediaId))
                            return false;

                        let mediaInfo = ppixiv.mediaCache.getMediaInfoSync(mediaId, { full: false });
                        return mediaInfo && mediaInfo.illustType != 2;
                    },

                    onclick: async () => {
                        let mediaInfo = await ppixiv.mediaCache.getMediaInfo(this._mediaId, { full: true });
                        let page = helpers.parseMediaId(this.mediaId).page;
                        let { url } = ppixiv.mediaCache.getMainImageUrl(mediaInfo, page);

                        let title = `${mediaInfo.userName} - ${mediaInfo.illustId}`;
                        if(mediaInfo.mangaPages.length > 1)
                        {
                            let mangaPage = helpers.parseMediaId(this._mediaId).page;
                            title += " #" + (mangaPage + 1);
                        }

                        title += `.${helpers.getExtension(url)}`;
                        navigator.share({
                            url,
                            title,
                        });
                    }
                });
            },

            downloadImage: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Download image",
                    icon: "mat:download",
                    hideIfUnavailable: true,
                    requiresImage: true,
                    available: () => { return this.mediaInfo && Actions.isDownloadTypeAvailable("image", this.mediaInfo); },
                    onclick: () => {
                        Actions.downloadIllust(this.mediaId, "image");
                        this.parent.hide();
                    }
                });
            },

            downloadManga: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Download manga ZIP",
                    icon: "mat:download",
                    hideIfUnavailable: true,
                    requiresImage: true,
                    available: () => { return this.mediaInfo && Actions.isDownloadTypeAvailable("ZIP", this.mediaInfo); },
                    onclick: () => {
                        Actions.downloadIllust(this.mediaId, "ZIP");
                        this.parent.hide();
                    }
                });
            },

            downloadVideo: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Download video MKV",
                    icon: "mat:download",
                    hideIfUnavailable: true,
                    requiresImage: true,
                    available: () => { return this.mediaInfo && Actions.isDownloadTypeAvailable("MKV", this.mediaInfo); },
                    onclick: () => {
                        Actions.downloadIllust(this.mediaId, "MKV");
                        this.parent.hide();
                    }
                });
            },

            sendToTab: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Send to tab",
                    classes: ["button-send-image"],
                    icon: "mat:open_in_new",
                    requiresImage: true,
                    onclick: () => {
                        new SendImagePopup({ mediaId: this.mediaId });
                        this.parent.hide();
                    }
                });
            },

            toggleSlideshow: () => {
                return new MenuOptionToggle({
                    ...sharedOptions,
                    label: "Slideshow",
                    icon: "mat:wallpaper",
                    requiresImage: true,
                    checked: helpers.args.location.hash.get("slideshow") == "1",
                    onclick: () => {
                        ppixiv.app.toggleSlideshow();
                        this.refresh();
                    },
                });
            },

            toggleLoop: () => {
                return new MenuOptionToggle({
                    ...sharedOptions,
                    label: "Loop",
                    checked: helpers.args.location.hash.get("slideshow") == "loop",
                    icon: "mat:replay_circle_filled",
                    requiresImage: true,
                    hideIfUnavailable: true,
                    onclick: () => {
                        ppixiv.app.loopSlideshow();
                        this.refresh();
                    },
                });
            },

            linkedTabs: () => {
                let widget = new MenuOptionToggleSetting({
                    container: optionBox,
                    label: "Linked tabs",
                    setting: "linked_tabs_enabled",
                    icon: "mat:link",
                });
                
                new MenuOptionButton({
                    container: widget.container.querySelector(".checkbox"),
                    containerPosition: "beforebegin",
                    label: "Edit",
                    classes: ["small-font"],

                    onclick: (e) => {
                        e.stopPropagation();

                        new SettingsPageDialog({ settingsPage: "linkedTabs" });

                        this.parent.hide();
                        return true;
                    },
                });

                return widget;
            },

            imageEditing: () => {
                return new MenuOptionToggleSetting({
                    ...sharedOptions,
                    label: "Image editing",
                    icon: "mat:brush",
                    setting: "imageEditing",
                    requiresImage: true,

                    onclick: () => {
                        // When editing is turned off, clear the editing mode too.
                        let enabled = ppixiv.settings.get("imageEditing");
                        if(!enabled)
                            ppixiv.settings.set("image_editing_mode", null);
                    },
                });
            },

            openSettings: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Settings",
                    icon: "mat:settings",
                    onclick: () => {
                        new SettingsDialog();
                        this.parent.hide();
                    }
                });
            },

            exit: () => {
                return new MenuOptionButton({
                    ...sharedOptions,
                    label: "Return to Pixiv",
                    icon: "mat:logout",
                    url: "#no-ppixiv",
                });
            },
        };

        this._menuOptions = [];
        if(!ppixiv.native)
        {
            this._menuOptions.push(menuOptions.similarIllustrations());
            this._menuOptions.push(menuOptions.similarArtists());
            if(this.showExtra)
                this._menuOptions.push(menuOptions.similarBookmarks());
            
            this._menuOptions.push(menuOptions.downloadImage());
            this._menuOptions.push(menuOptions.downloadManga());
            this._menuOptions.push(menuOptions.downloadVideo());
            this._menuOptions.push(menuOptions.editMutes());

            // This is hidden by default since it's special-purpose: it shares the image URL, not the
            // page URL, which is used for special-purpose iOS shortcuts stuff that probably nobody else
            // cares about.
            if(ppixiv.settings.get("show_share"))
                this._menuOptions.push(menuOptions.shareImage());
        }
        else
        {
            this._menuOptions.push(menuOptions.similarLocalImages());
        }

        if(ppixiv.sendImage.enabled)
        {
            this._menuOptions.push(menuOptions.sendToTab());
            this._menuOptions.push(menuOptions.linkedTabs());
        }

        // These are in the top-level menu on mobile.  Don't show these if we're on the search
        // view either, since they want to actually be on the illust view, not hovering a thumbnail.
        let screenName = ppixiv.app.getDisplayedScreen({ name: true })
        if(!ppixiv.mobile && screenName == "illust")
        {
            this._menuOptions.push(menuOptions.toggleSlideshow());
            this._menuOptions.push(menuOptions.toggleLoop());
        }
        if(!ppixiv.mobile)
            this._menuOptions.push(menuOptions.imageEditing());
        if(ppixiv.native)
            this._menuOptions.push(menuOptions.indexFolderForSimilaritySearch());
        if(this.showExtra || ppixiv.native)
            this._menuOptions.push(menuOptions.refreshImage());

        // Add settings for mobile.  On desktop, this is available in a bunch of other
        // higher-profile places.
        if(ppixiv.mobile)
            this._menuOptions.push(menuOptions.openSettings());

        if(!ppixiv.native && !ppixiv.mobile)
            this._menuOptions.push(menuOptions.exit());
    }

    setUserId(userId)
    {
        this.userId = userId;
        this.refresh();
    }

    visibilityChanged()
    {
        if(this.visible)
            this.refresh();
    }

    async refreshInternal({ mediaId, mediaInfo })
    {
        if(!this.visible)
            return;

        this._createMenuOptions();

        this.mediaInfo = mediaInfo;

        for(let option of this._menuOptions)
        {
            let enable = true;
    
            // Enable or disable buttons that require an image.
            if(option.options.requiresImage && mediaId == null)
                enable = false;
            if(option.options.requiresUser && this.userId == null)
                enable = false;
            if(option.options.requires && !option.options.requires({mediaId, userId: this.userId}))
                enable = false;
            if(enable && option.options.available)
                enable = option.options.available();
            option.enabled = enable;

            // Some options are hidden when they're unavailable, because they clutter
            // the menu too much.
            if(option.options.hideIfUnavailable)
                option.container.hidden = !enable;
        }
    }
}