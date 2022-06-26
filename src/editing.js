"use strict";

ppixiv.ImageEditor = class extends ppixiv.illust_widget
{
    constructor({onvisibilitychanged, ...options})
    {
        super({...options,
            template: `
            <div class=image-editor>
                <div class="image-editor-buttons top">
                    <div class="image-editor-button-row box-button-row">
                        ${ helpers.create_box_link({icon: "save",     popup: "Save",          classes: ["save-edits", "popup-bottom"] }) }
                        ${ helpers.create_box_link({icon: "refresh",  popup: "Saving...",     classes: ["spinner"] }) }
                        ${ helpers.create_box_link({icon: "crop",     popup: "Crop",          classes: ["show-crop", "popup-bottom"] }) }
                        ${ helpers.create_box_link({icon: "wallpaper",popup:  "Edit panning", classes: ["show-pan", "popup-bottom"] }) }
                        ${ helpers.create_box_link({icon: "brush",    popup: "Inpainting",    classes: ["show-inpaint", "popup-bottom"] }) }
                        ${ helpers.create_box_link({icon: "close",    popup: "Stop editing",  classes: ["close-editor", "popup-bottom"] }) }
                    </div>
                </div>
                <div class="image-editor-buttons bottom"></div>
            </div>
        `});

        this.container.querySelector(".spinner").hidden = true;

        let crop_editor = new ppixiv.CropEditor({
            container: this.container,
            parent: this,
            mode: "crop",
        });

        let pan_editor = new ppixiv.PanEditor({
            container: this.container,
            parent: this,
        });

        let inpaint_editor = new ppixiv.InpaintEditor({
            container: this.container,
            parent: this,
        });

        this.editors = {
            inpaint: inpaint_editor,
            crop: crop_editor,
            pan: pan_editor,
        };

        this.onvisibilitychanged = onvisibilitychanged;
        this._dirty = false;
        this.editing_media_id = null;
        this.undo_stack = [];

        this.top_button_row = this.container.querySelector(".image-editor-buttons.top");

        this.show_crop = this.container.querySelector(".show-crop");
        this.show_crop.addEventListener("click", (e) => {
            e.stopPropagation();

            this.active_editor_name = this.active_editor_name == "crop"? null:"crop";
        });

        this.show_pan = this.container.querySelector(".show-pan");
        this.show_pan.addEventListener("click", (e) => {
            e.stopPropagation();

            this.active_editor_name = this.active_editor_name == "pan"? null:"pan";
        });

        this.show_inpaint = this.container.querySelector(".show-inpaint");
        this.show_inpaint.hidden = true;
        this.show_inpaint.addEventListener("click", (e) => {
            e.stopPropagation();

            this.active_editor_name = this.active_editor_name == "inpaint"? null:"inpaint";
        });

        window.addEventListener("keydown", (e) => {
            if(!this.visible)
                return;

            if(e.code == "KeyC" && e.ctrlKey)
            {
                // Only copy if the mouse is somewhere over the editor, so we don't prevent
                // copying text out of the corner hover UI.
                if(!this.hovering)
                    return;

                e.preventDefault();
                e.stopPropagation();
                this.copy();
            }
            else if(e.code == "KeyV" && e.ctrlKey)
            {
                e.preventDefault();
                e.stopPropagation();
                this.paste();
            }
        }, { signal: this.shutdown_signal.signal });

        // Refresh when these settings change.
        for(let setting of ["image_editing", "image_editing_mode"])
            settings.changes.addEventListener(setting, () => {
                this.refresh();

                // Let our parent know that we may have changed editor visibility, since this
                // affects whether image cropping is active.
                this.onvisibilitychanged();
            }, { signal: this.shutdown_signal.signal });

        // Stop propagation of pointerdown at the container, so clicks inside the UI don't
        // move the image.
        this.container.addEventListener("pointerdown", (e) => { e.stopPropagation(); });

        // Prevent fullscreen doubleclicks on UI buttons.
        this.container.addEventListener("dblclick", (e) => {
            e.stopPropagation();
        });

        this.save_edits = this.container.querySelector(".save-edits");
        this.save_edits.addEventListener("click", async (e) => {
            e.stopPropagation();
            this.save();
        }, { signal: this.shutdown_signal.signal });

        this.close_editor = this.container.querySelector(".close-editor");
        this.close_editor.addEventListener("click", async (e) => {
            e.stopPropagation();
            settings.set("image_editing", null);
            settings.set("image_editing_mode", null);
        }, { signal: this.shutdown_signal.signal });

        // Hotkeys:
        window.addEventListener("keydown", (e) => {
            if(e.code == "KeyS" && e.ctrlKey)
            {
                e.stopPropagation();
                e.preventDefault();
                this.save();
            }

            if(e.code == "KeyZ" && e.ctrlKey)
            {
                e.stopPropagation();
                e.preventDefault();
                this.undo();
            }

            if(e.code == "KeyY" && e.ctrlKey)
            {
                e.stopPropagation();
                e.preventDefault();
                this.redo();
            }
        }, { signal: this.shutdown_signal.signal });

        // Steal buttons from the individual editors.
        let inpaint_buttons = this.editors.inpaint.container.querySelector(".image-editor-button-row");
        inpaint_buttons.remove();
        this.container.querySelector(".image-editor-buttons.bottom").appendChild(inpaint_buttons);

        let pan_buttons = this.editors.pan.container.querySelector(".image-editor-button-row");
        pan_buttons.remove();
        this.container.querySelector(".image-editor-buttons.bottom").appendChild(pan_buttons);
    }

    // Return true if the crop editor is active.
    get editing_crop()
    {
        return settings.get("image_editing", false) && this.active_editor_name == "crop";
    }

    shutdown()
    {
        for(let editor of Object.values(this.editors))
            editor.shutdown();

        super.shutdown();
    }

    visibility_changed()
    {
        settings.set("image_editing", this.visible);

        // Refresh to update editor visibility.
        this.refresh();

        this.onvisibilitychanged();

        super.visibility_changed();
    }

    // Return true if the mouse is hovering over the editor.  This includes hovering over the image,
    // but not over the corner UI.
    get hovering()
    {
        if(this.container.matches(":hover"))
            return true;
        if(this.current_overlay_container && this.current_overlay_container.container.matches(":hover"))
            return true;
        return false;
    }

    // In principle we could refresh from thumbnail data if this is the first manga page, since
    // all we need is the image dimensions.  However, the editing container is only displayed
    // by on_click_viewer after we have full image data anyway since it's treated as part of the
    // main image, so we won't be displayed until then anyway.
    async refresh_internal({ media_id, illust_data })
    {
        // We can get the media ID before we have illust_data.  Ignore it until we have both.
        if(illust_data == null)
            media_id = null;

        let editor_is_open = this.open_editor != null;
        let media_id_changing = media_id != this.editing_media_id;

        this.editing_media_id = media_id;

        // Only tell the editor to replace its own data if we're changing images, or the
        // editor is closed.  If the editor is open and we're not changing images, don't
        // clobber ongoing edits.
        let replace_editor_data = media_id_changing || !editor_is_open;

        // For local images, editing data is simply stored as a field on the illust data, which
        // we can save to the server.
        //
        // For Pixiv images, we store editing data locally in IndexedDB.  All pages are stored on
        // the data for the first page, as an extraData dictionary with page media IDs as keys.
        //
        // Pull out the dictionary containing editing data for this image to give to the editor.
        let { width, height } = image_data.get_dimensions(illust_data, media_id);
        let extra_data = image_data.get_extra_data(illust_data, media_id);

        // Give the editors the new illust data.
        for(let editor of Object.values(this.editors))
            editor.set_illust_data({ media_id, extra_data, width, height, replace_editor_data });

        // If no editor is open, make sure the undo stack is cleared and clear dirty.
        if(!editor_is_open)
        {
            // Otherwise, just make sure the undo stack is cleared.
            this.undo_stack = [];
            this.redo_stack = [];
            this.dirty = false;
        }
    }

    get open_editor()
    {
        for(let editor of Object.values(this.editors))
        {
            if(editor.visible)
                return editor;
        }

        return null;
    }

    // This is called when the ImageEditingOverlayContainer changes.
    set overlay_container(overlay_container)
    {
        this.current_overlay_container = overlay_container;
        for(let editor of Object.values(this.editors))
            editor.overlay_container = overlay_container;
    }

    refresh()
    {
        super.refresh();

        this.visible = settings.get("image_editing", false);
        helpers.set_class(this.save_edits, "dirty", this.dirty);

        let is_local = helpers.is_media_id_local(this.media_id);
        if(this.media_id != null)
            this.show_inpaint.hidden = !is_local;

        let showing_crop = this.active_editor_name == "crop" && this.visible;
        this.editors.crop.visible = showing_crop;
        helpers.set_class(this.show_crop, "selected", showing_crop);

        let showing_pan = this.active_editor_name == "pan" && this.visible;
        this.editors.pan.visible = showing_pan;
        helpers.set_class(this.show_pan, "selected", showing_pan);

        let showing_inpaint = is_local && this.active_editor_name == "inpaint" && this.visible;
        this.editors.inpaint.visible = showing_inpaint;
        helpers.set_class(this.show_inpaint, "selected", showing_inpaint);

        // Disable hiding the mouse cursor when editing is enabled.  This also prevents
        // the top button row from being hidden.
        if(showing_crop || showing_inpaint)
            hide_mouse_cursor_on_idle.disable_all("image-editing");
        else
            hide_mouse_cursor_on_idle.enable_all("image-editing");
    }

    // Store the current data as an undo state.
    save_undo()
    {
        this.undo_stack.push(this.get_state());
        this.redo_stack = [];

        // Anything that adds to the undo stack causes us to be dirty.
        this.dirty = true;
    }

    // Revert to the previous undo state, if any.
    undo()
    {
        if(this.undo_stack.length == 0)
            return;

        this.redo_stack.push(this.get_state());
        this.set_state(this.undo_stack.pop());

        // If InpaintEditor was adding a line, we just undid the first point, so end it.
        this.editors.inpaint.adding_line = null;
    }

    // Redo the last undo.
    redo()
    {
        if(this.redo_stack.length == 0)
            return;

        this.undo_stack.push(this.get_state());
        this.set_state(this.redo_stack.pop());
    }

    // Load and save state, for undo.
    get_state()
    {
        let result = {};
        for(let [name, editor] of Object.entries(this.editors))
            result[name] = editor.get_state();
        return result;
    }

    set_state(state)
    {
        for(let [name, editor] of Object.entries(this.editors))
            editor.set_state(state[name]);
    }

    get_data_to_save({include_empty=true}={})
    {
        let edits = { };
        for(let editor of Object.values(this.editors))
        {
            for(let [key, value] of Object.entries(editor.get_data_to_save()))
            {
                if(include_empty || value != null)
                    edits[key] = value;
            }
        }
        return edits;
    }

    async save()
    {
        // Clear dirty before saving, so any edits made while saving will re-dirty, but set
        // it back to true if there's an error saving.
        this.dirty = false;

        let spinner = this.container.querySelector(".spinner");
        this.save_edits.hidden = true;
        spinner.hidden = false;
        try {
            // Get data from each editor.
            let edits = this.get_data_to_save();

            let result;
            if(helpers.is_media_id_local(this.media_id))
            {
                result = await local_api.local_post_request(`/api/set-image-edits/${this.media_id}`, edits);
                if(!result.success)
                {
                    console.error("Error saving image edits:", result);
                    this.dirty = true;
                    return;
                }

                result = result.illust;
                image_data.singleton().update_media_info(this.media_id, result);
            }
            else
            {
                // Save data for Pixiv images to image_data.
                result = await image_data.singleton().save_extra_image_data(this.media_id, edits);                
            }

            // Let the widgets know that we saved.
            let current_editor = this.active_editor;
            if(current_editor?.after_save)
                current_editor.after_save(result);
        } finally {
            this.save_edits.hidden = false;
            spinner.hidden = true;
        }
    }

    async copy()
    {
        let data = this.get_data_to_save({include_empty: false});

        if(Object.keys(data).length == 0)
        {
            message_widget.singleton.show("No edits to copy");
            return;
        }

        data.type = "ppixiv-edits";
        data = JSON.stringify(data, null, 4);

        // We should be able to write to the clipboard with a custom MIME type that we can
        // recognize, but the clipboard API is badly designed and only lets you write a tiny
        // set of types.
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/plain": new Blob([data], { type: "text/plain" })
            })
        ]);

        message_widget.singleton.show("Edits copied");
    }

    async paste()
    {
        let text = await navigator.clipboard.readText();
        let data;
        try {
            data = JSON.parse(text);
        } catch(e) {
            message_widget.singleton.show("Clipboard doesn't contain edits");
            return;
        }

        if(data.type != "ppixiv-edits")
        {
            message_widget.singleton.show("Clipboard doesn't contain edits");
            return;
        }

        this.set_state(data);
        await this.save();

        message_widget.singleton.show("Edits pasted");
    }

    get active_editor_name()
    {
        return settings.get("image_editing_mode", null);
    }

    set active_editor_name(editor_name)
    {
        if(editor_name != null && this.editors[editor_name] == null)
            throw new Error(`Invalid editor name ${editor_name}`);

        settings.set("image_editing_mode", editor_name);
    }

    get active_editor()
    {
        let current_editor = this.active_editor_name;
        if(current_editor == null)
            return null;
        else
            return this.editors[current_editor];
    }

    get dirty() { return this._dirty; }
    set dirty(value)
    {
        if(this._dirty == value)
            return;

        this._dirty = value;
        this.refresh();
    }
}

// This is a custom element that roughly emulates an HTMLImageElement, but contains two
// overlaid images instead of one to overlay the inpaint, and holds the InpaintEditorOverlay.
// Load and error events are dispatched, and the image is considered loaded or complete when
// both of its images are loaded or complete.  This allows on_click_viewer to display inpainting
// and the inpaint editor without needing to know much about it, so we can avoid complicating
// the viewer.
ppixiv.ImageEditingOverlayContainer = class extends ppixiv.widget
{
    constructor({
        ...options
    })
    {
        super({...options, template: `
            <div class=editing-container>
                <img class="filtering displayed-image main-image">
                <img class="filtering displayed-image inpaint-image">
                <img class="filtering displayed-image low-res-preview">

                <div class=inpaint-editor-overlay-container></div>
                <div class=crop-editor-overlay-container></div>
                <div class=pan-editor-overlay-container></div>
            </div>
        `});

        this.inpaint_editor_overlay_container = this.container.querySelector(".inpaint-editor-overlay-container");
        this.crop_editor_overlay_container = this.container.querySelector(".crop-editor-overlay-container");
        this.pan_editor_overlay_container = this.container.querySelector(".pan-editor-overlay-container");

        this.main_img = this.container.querySelector(".main-image");
        this.inpaint_img = this.container.querySelector(".inpaint-image");
        this.preview_img = this.container.querySelector(".low-res-preview");
    }

    shutdown()
    {
        // Clear the image URLs when we remove them, so any loads are cancelled.  This seems to
        // help Chrome with GC delays.
        if(this.main_img)
        {
            this.main_img.src = helpers.blank_image;
            this.main_img.remove();
            this.main_img = null;
        }

        if(this.preview_img)
        {
            this.preview_img.src = helpers.blank_image;
            this.preview_img.remove();
            this.preview_img = null;
        }

        this.container.remove();
    }

    set_image_urls(image_url, inpaint_url)
    {
        this.image_src = image_url || "";
        this.inpaint_src = inpaint_url || "";
    }

    set inpaint_editor_overlay(node)
    {
        helpers.remove_elements(this.inpaint_editor_overlay_container);
        this.inpaint_editor_overlay_container.appendChild(node);
    }

    set crop_editor_overlay(node)
    {
        helpers.remove_elements(this.crop_editor_overlay_container);
        this.crop_editor_overlay_container.appendChild(node);
    }

    set pan_editor_overlay(node)
    {
        helpers.remove_elements(this.pan_editor_overlay_container);
        this.pan_editor_overlay_container.appendChild(node);
    }

    // Set the image URLs.  If set to null, use a blank image instead so we don't trigger
    // load errors.
    get image_src() { return this.main_img.src; }
    set image_src(value) { this.main_img.src = value || helpers.blank_image; }
    get inpaint_src() { return this.inpaint_img.src; }
    set inpaint_src(value) { this.inpaint_img.src = value || helpers.blank_image; }

    get complete()
    {
        return this.main_img.complete && this.inpaint_img.complete;
    }

    decode()
    {
        return Promise.all([this.main_img.decode(), this.inpaint_img.decode()]);
    }

    get width() { return this.main_img.width; }
    get height() { return this.main_img.height; }
    get naturalWidth() { return this.main_img.naturalWidth; }
    get naturalHeight() { return this.main_img.naturalHeight; }

    get hide_inpaint() { return this.inpaint_img.style.opacity == 0; }
    set hide_inpaint(value)
    {
        this.inpaint_img.style.opacity = value? 0:1;
    }
}
