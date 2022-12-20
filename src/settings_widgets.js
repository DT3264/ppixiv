ppixiv.settings_widgets = {
    create({ global_options })
    {
        // Each settings widget.  Doing it this way lets us move widgets around in the
        // menu without moving big blocks of code around.
        return {
            thumbnail_size: () => {
                let button = new menu_option_button({
                    ...global_options,
                    label: "Thumbnail size",
                });

                new thumbnail_size_slider_widget({
                    container: button.container,
                    setting: "thumbnail-size",
                    classes: ["size-slider"],
                    min: 0,
                    max: 7,
                }),
        
                button.container.querySelector(".size-slider").style.flexGrow = .25;
            },

            manga_thumbnail_size: () => {
                let button = new menu_option_button({
                    ...global_options,
                    label: "Thumbnail size (manga)",
                });

                new thumbnail_size_slider_widget({
                    container: button.container,
                    setting: "manga-thumbnail-size",
                    classes: ["size-slider"],
                    min: 0,
                    max: 7,
                }),
        
                button.container.querySelector(".size-slider").style.flexGrow = .25;
            },

            disabled_by_default: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Disabled by default",
                    setting: "disabled-by-default",
                    explanation_enabled: "Go to Pixiv by default.",
                    explanation_disabled: "Go here by default.",
                });
            },
    
            no_hide_cursor: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Hide cursor",
                    setting: "no-hide-cursor",
                    invert_display: true,
                    explanation_enabled: "Hide the cursor while the mouse isn't moving.",
                    explanation_disabled: "Don't hide the cursor while the mouse isn't moving.",
                });
            },
    
            invert_popup_hotkey: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Shift-right-click to show the popup menu",
                    setting: "invert-popup-hotkey",
                    explanation_enabled: "Shift-right-click to open the popup menu",
                    explanation_disabled: "Right click opens the popup menu",
                });
            },

            ctrl_opens_popup: () => {
                    return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Hold ctrl to show the popup menu",
                    setting: "ctrl_opens_popup",
                    explanation_enabled: "Pressing Ctrl shows the popup menu (for laptops)",
                });
            },

            ui_on_hover: () => {
                new menu_option_toggle_setting({
                    ...global_options,
                    label: "Hover to show search box",
                    setting: "ui-on-hover",
                    refresh: this.update_from_settings,
                    explanation_enabled: "Only show the search box when hovering over it",
                    explanation_disabled: "Always show the search box",
                });
            },

            invert_scrolling: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Invert image panning",
                    setting: "invert-scrolling",
                    explanation_enabled: "Dragging down moves the image down",
                    explanation_disabled: "Dragging down moves the image up",
                });
            },

            theme: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Light mode",
                    setting: "theme",
                    on_value: "light",
                    off_value: "dark",
                    explanation_enabled: "FLASHBANG",
                });
            },
    
            disable_translations: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Show tag translations when available",
                    setting: "disable-translations",
                    invert_display: true,
                });
            },
    
            disable_thumbnail_panning: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Pan thumbnails while hovering over them",
                    setting: "disable_thumbnail_panning",
                    invert_display: true,
                });
            },
    
            disable_thumbnail_zooming: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Zoom out thumbnails while hovering over them",
                    setting: "disable_thumbnail_zooming",
                    invert_display: true,
                });
            },
    
            enable_transitions: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Use transitions",
                    setting: "animations_enabled",
                });
            },

            bookmark_privately_by_default: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Bookmark and follow privately by default",
                    setting: "bookmark_privately_by_default",
                    explanation_disabled: "Pressing Ctrl-B will bookmark publically",
                    explanation_enabled: "Pressing Ctrl-B will bookmark privately",
                });
            },

            limit_slideshow_framerate: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Limit slideshows to 60 FPS",
                    setting: "slideshow_framerate",
                    on_value: 60,
                    off_value: null,
                });
            },

            import_extra_data: () => {
                let widget = new menu_option_row({
                    ...global_options,
                    label: "Image edits",
                });

                new menu_option_button({
                    icon: "file_upload",
                    label: "Import",
                    container: widget.container,
                    onclick: () => ppixiv.extra_image_data.get.import(),
                });

                new menu_option_button({
                    icon: "file_download",
                    label: "Export",
                    container: widget.container,
                    onclick: () => ppixiv.extra_image_data.get.export(),
                });
                return widget;
            },

            stage_slideshow: () => {
                let widget = new menu_option_row({
                    ...global_options,
                    label: "Bookmark slideshow",
                });

                new menu_option_button({
                    icon: "wallpaper",
                    label: "Go",
                    container: widget.container,
                    onclick: () => {
                        // Close the settings dialog.
                        global_options.close_settings();

                        ppixiv.slideshow_staging_dialog.show();
                    },
                });

                return widget;
            },

            quick_view: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Quick view",
                    setting: "quick_view",
                    explanation_enabled: "Navigate to images immediately when the mouse button is pressed",
    
                    check: () => {
                        // Only enable changing this option when using a mouse.  It has no effect
                        // on touchpads.
                        if(ppixiv.pointer_listener.pointer_type == "mouse")
                            return true;
    
                        message_widget.singleton.show("Quick View is only supported when using a mouse.");
                        return false;
                    },
                });
            },
    
            auto_pan: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Pan images",
                    setting: "auto_pan",
                    explanation_enabled: "Pan images while viewing them (drag the image to stop)",
                });
            },

            auto_pan_speed: () => {
                let button = new menu_option_button({
                    ...global_options,
                    label: "Time per image",
                    get_label: () => {
                        let seconds = settings.get("auto_pan_duration");;
                        return `Pan duration: ${seconds} ${seconds != 1? "seconds":"second"}`;                                        
                    },
                });

                new menu_option_slider_setting({
                    container: button,
                    setting: "auto_pan_duration",
                    list: [1, 2, 3, 5, 10, 15, 20, 30, 45, 60],
                    classes: ["size-slider"],

                    // Refresh the label when the value changes.
                    refresh: () => button.refresh(),
                });

                button.container.querySelector(".size-slider").style.flexGrow = .25;
        
                return button;
            },

            slideshow_speed: () => {
                let button = new menu_option_button({
                    ...global_options,
                    label: "Time per image",
                    get_label: () => {
                        let seconds = settings.get("slideshow_duration");;
                        return `Slideshow duration: ${seconds} ${seconds != 1? "seconds":"second"}`;
                    },
                });
        
                new menu_option_slider_setting({
                    container: button,
                    setting: "slideshow_duration",
                    list: [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180],
                    classes: ["size-slider"],
                    
                    // Refresh the label when the value changes.
                    refresh: () => { button.refresh(); },
                });

                button.container.querySelector(".size-slider").style.flexGrow = .25;
            },

            slideshow_default_animation: () => {
                return new ppixiv.menu_option_options_setting({
                    ...global_options,
                    setting: "slideshow_default",
                    label: "Slideshow mode",
                    values: ["pan", "contain"],
                    explanation: (value) => {
                        switch(value)
                        {
                        case "pan": return "Pan the image left-to-right or top-to-bottom";
                        case "contain": return "Fade in and out without panning";
                        }
                    },
                });
            },

            slideshow_skips_manga: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Slideshow skips manga pages",
                    setting: "slideshow_skips_manga",
                    explanation_enabled: "Slideshow mode will only show the first page.",
                    explanation_disabled: "Slideshow mode will show all pages.",
                });
            },

            expand_manga_posts: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Expand manga posts in search results",
                    setting: "expand_manga_thumbnails",
                });
            },

            view_mode: () => {
                new menu_option_toggle_setting({
                    ...global_options,
                    label: "Return to the top when changing images",
                    setting: "view_mode",
                    on_value: "manga",
                    off_value: "illust",
                });
            },
            link_tabs: () => {
                let widget = new link_tabs_popup({
                    ...global_options,
                });

                // Tell the widget when it's no longer visible.
                global_options.page_removed_signal.addEventListener("abort", () => { widget.visible = false; });
                return widget;
            },
            enable_linked_tabs: () => {
                return new menu_option_toggle_setting({
                    ...global_options,
                    label: "Enabled",
                    setting: "linked_tabs_enabled",
                });
            },
            unlink_all_tabs: () => {
                return new menu_option_button({
                    ...global_options,
                    label: "Unlink all tabs",
                    onclick: () => {
                        settings.set("linked_tabs", []);
                    },
                });
            },
            muted_tags: () => {
                let widget = new muted_tags_popup({
                    mute_type: "tag",
                    ...global_options,
                });

                // Tell the widget when it's no longer visible.
                global_options.page_removed_signal.addEventListener("abort", () => { widget.visible = false; });

                return widget;
            },
            muted_users: () => {
                let widget = new muted_tags_popup({
                    mute_type: "user",
                    ...global_options,
                });

                // Tell the widget when it's no longer visible.
                global_options.page_removed_signal.addEventListener("abort", () => { widget.visible = false; });

                return widget;
            },
            whats_new: async() => {
                let { default: WhatsNew } = await ppixiv.importModule("vview/widgets/whats-new.js");

                let widget = new WhatsNew({
                    ...global_options,
                });

                global_options.page_removed_signal.addEventListener("abort", () => { widget.visible = false; });

                return widget;
            },
        };
    }
}

let _page_titles = {
    thumbnail:  "Thumbnail options",
    image:"Image viewing",
    tag_muting: "Muted tags",
    user_muting: "Muted users",
    linked_tabs: "Linked tabs",
    other: "Other",
    whats_new: "What's New",
};

ppixiv.settings_dialog = class extends ppixiv.dialog_widget
{
    constructor({show_page="thumbnail", ...options}={})
    {
        super({
            ...options,
            dialog_class: "settings-dialog",
            classes: ["settings-window"],
            header: "Settings",

            template: `
                <div class="sections vertical-scroller"></div>
                <div class="items vertical-scroller"></div>
            `
        });

        this.phone = helpers.is_phone;
        helpers.set_class(this.container, "phone", this.phone);
        this.page_buttons = {};

        // If we're using a phone UI, we're showing items by opening a separate dialog.  The
        // page contents block will be empty, so hide it to let the options center.
        this.container.querySelector(".items").hidden = this.phone;

        this.add_pages();

        // If we're not on the phone UI, show the default page.
        show_page ??= "thumbnail";

        if(!this.phone)
            this.show_page(show_page);
    }

    add_pages()
    {
        this.create_page_button("thumbnail");
        this.create_page_button("image");

        if(!ppixiv.native)
        {
            this.create_page_button("tag_muting");
            this.create_page_button("user_muting");
        }

        if(ppixiv.send_image.enabled)
            this.create_page_button("linked_tabs");

        this.create_page_button("other");
        this.create_page_button("whats_new");
    }

    create_page_button(name)
    {
        let page_button = this.create_template({
            html: helpers.create_box_link({
                label: _page_titles[name],
                classes: ["settings-page-button"],
            }),
        });
        page_button.dataset.page = name;

        page_button.addEventListener("click", (e) => {
            this.show_page(name);
        });
        this.container.querySelector(".sections").appendChild(page_button);
        this.page_buttons[name] = page_button;

        return page_button;
    }

    show_page(name)
    {
        if(this.visible_page_name == name)
            return;

        // Remove the widget page or dialog if it still exists.
        if(this.page_widget != null)
            this.page_widget.shutdown();
        console.assert(this.page_widget == null);

        this.visible_page_name = name;

        if(name != null)
        {
            this.page_widget = this.create_page(name);
            helpers.set_class(this.page_buttons[name], "selected", true);
            if(!this.phone)
                this.header = _page_titles[name];

            this.page_widget.shutdown_signal.signal.addEventListener("abort", () => {
                this.page_widget = null;
                helpers.set_class(this.page_buttons[name], "selected", false);
            });
        }
    }

    create_page(settings_page)
    {
        // If we're on a phone, create a dialog to show the page.  Otherwise, create the page in our
        // items container.
        if(this.phone)
            return new settings_page_dialog({ settings_page });

        let page_widget = new ppixiv.widget({
            container: this.container.querySelector(".items"),
            template: `
                <div class=settings-page></div>
            `
        });

        ppixiv.settings_dialog._fill_page({
            settings_page,
            page_widget,
            page_container: page_widget.container,
        });

        return page_widget;
    }

    static _fill_page({ settings_page, page_widget, page_container })
    {
        // Set settings-list if this page is a list of options, like the thumbnail options page.
        // This class enables styling for these lists.  If it's another type of settings page
        // with its own styling, this is disabled.
        let is_settings_list = settings_page != "tag_muting" && settings_page != "user_muting";
        if(is_settings_list)
            page_container.classList.add("settings-list");

        // Options that we pass to all menu_options:
        let global_options = {
            classes: ["settings-row"],
            container: page_container,
            page_removed_signal: page_widget.shutdown_signal.signal,

            // Settings widgets can call this to close the window.
            close_settings: () => {
                this.visible = false;
            },
        };

        // This gives us a dictionary of functions we can use to create each settings widget.
        let settings_widgets = ppixiv.settings_widgets.create({ global_options });

        let pages = {
            thumbnail: () =>
            {
                settings_widgets.thumbnail_size();
                if(!ppixiv.native)
                    settings_widgets.manga_thumbnail_size();
                if(!ppixiv.mobile)
                {
                    settings_widgets.disable_thumbnail_panning();
                    settings_widgets.disable_thumbnail_zooming();
                    settings_widgets.quick_view();
                    settings_widgets.ui_on_hover();
                }
                
                if(!ppixiv.native)
                    settings_widgets.expand_manga_posts();
            },
            image: () => {
                settings_widgets.auto_pan();
                settings_widgets.auto_pan_speed();
                settings_widgets.slideshow_speed();
                settings_widgets.slideshow_default_animation();
                if(!ppixiv.native) // native mode doesn't support manga pages
                    settings_widgets.slideshow_skips_manga();
                
                settings_widgets.view_mode();
                if(!ppixiv.mobile)
                {
                    settings_widgets.invert_scrolling();
                    settings_widgets.no_hide_cursor();
                }
            },

            tag_muting: () => {
                settings_widgets.muted_tags();
            },

            user_muting: () => {
                settings_widgets.muted_users();
            },

            linked_tabs: () => {
                settings_widgets.link_tabs({visible: false});
                settings_widgets.enable_linked_tabs();
                settings_widgets.unlink_all_tabs();
            },

            other: () => {
                settings_widgets.disable_translations();

                if(!ppixiv.native && !ppixiv.mobile)
                    settings_widgets.disabled_by_default();
                    
                if(!ppixiv.mobile)
                {
                    // Firefox's contextmenu behavior is broken, so hide this option.
                    if(navigator.userAgent.indexOf("Firefox/") == -1)
                        settings_widgets.invert_popup_hotkey();
        
                    settings_widgets.ctrl_opens_popup();
                    settings_widgets.enable_transitions();
                }
        
                // settings_widgets.theme();
                settings_widgets.bookmark_privately_by_default();
                settings_widgets.limit_slideshow_framerate();
        
                // Chrome supports showOpenFilePicker, but Firefox doesn't.  That API has been around in
                // Chrome for a year and a half, so I haven't implemented an alternative for Firefox.
                if(!ppixiv.native && window.showOpenFilePicker != null)
                    settings_widgets.import_extra_data();
        
                settings_widgets.stage_slideshow();
            },

            whats_new: () => {
                settings_widgets.whats_new();
            },
        };

        let create_page = pages[settings_page];
        if(create_page == null)
        {
            console.error(`Invalid settings page: ${settings_page}`);
            return;
        }

        create_page();
        
        // Add allow-wrap to all top-level box links that we just created, so the
        // settings menu scales better.  Don't recurse into nested buttons.
        for(let box_link of page_container.querySelectorAll(".settings-page > .box-link"))
            box_link.classList.add("allow-wrap");
    }
};

// This is used when we're on the phone UI to show a single settings page.
ppixiv.settings_page_dialog = class extends ppixiv.dialog_widget
{
    constructor({
        settings_page,
        ...options}={})
    {
        super({
            header: _page_titles[settings_page],

            ...options,
            dialog_class: "settings-dialog-page",

            // This is a nested dialog and closing it goes back to settings, so show
            // a back button instead of a close button.
            back_icon: true,
            template: ``
        });

        this.settings_container = this.querySelector(".scroll");
        this.settings_container.classList.add("settings-page");

        ppixiv.settings_dialog._fill_page({
            settings_page,
            page_widget: this,
            page_container: this.settings_container,
        });
    }
};
