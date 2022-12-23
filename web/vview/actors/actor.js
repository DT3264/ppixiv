// Actor is the base class for the actor tree.  Actors can have parent and child actors.
// Shutting down an actor will shut down its children.  Each actor has an AbortSignal
// which is aborted when the actor shuts down, so event listeners, fetches, etc. can be
// shut down with the actor.
//
// Most actors are widgets and should derive from ppixiv.widget.  The base actor class
// doesn't have HTML content or add itself to the DOM tree.  Non-widget actors are used
// for helpers that want to live in the actor tree, but don't have content of their own.
import { helpers } from 'vview/misc/helpers.js';

export default class Actor extends EventTarget
{
    // If true, stack traces will be logged if shutdown() is called more than once.  This takes
    // a stack trace on each shutdown, so it's only enabled when needed.
    static _debugShutdown = false;

    // A list of top-level actors (actors with no parent).  This is just for debugging.
    static _topActors = [];

    // Dump the actor tree to the console.
    static dumpActors({parent=null}={})
    {
        let actors = parent? parent.children:Actor._topActors;

        let grouped = false;
        if(parent)
        {
            // If this parent has any children, create a logging group.  Otherwise, just log it normally.
            if(actors.length == 0)
                console.log(parent);
            else
            {
                console.group(parent);
                grouped = true;
            }
        }

        try {
            for(let actor of actors)
                Actor.dumpActors({parent: actor});
        } finally {
            // Only remove the logging group if we created one.
            if(grouped)
                console.groupEnd();
        }
    }

    constructor({
        container,
        
        // The parent actor, if any.
        parent=null,

        // The actor will be shut down if this is aborted.
        signal=null,
        ...options
    }={})
    {
        super();
        
        this.options = options;
        this.parent = parent;
        this.children = [];

        // Create our shutdownSignal.  We'll abort this if we're shut down to shut down our children.
        // This is always shut down by us when shutdown() is called (it isn't used to shut us down).
        this.shutdownSignal = new AbortController();

        // If we weren't given a shutdown signal explicitly and we have a parent actor, inherit
        // its signal, so we'll shut down when the parent does.
        if(signal == null && this.parent != null)
            signal = this.parent.shutdownSignal.signal;

        // If we were given a parent shutdown signal, shut down if it aborts.
        if(signal)
            signal.addEventListener("abort", () => this.shutdown(), { once: true, ...this._signal });

        // Register ourself in our parent's child list.
        if(this.parent)
            this.parent._childAdded(this);
        else
            Actor._topActors.push(this);
    }

    shutdown()
    {
        if(Actor._debugShutdown && !this._previousShutdownStack)
        {
            try {
                throw new Error();
            } catch(e) {
                this._previousShutdownStack = e.stack;
            }
        }

        // We should only be shut down once, so shutdownSignal shouldn't already be signalled.
        if(this.shutdownSignal.signal.aborted)
        {
            console.error("Actor has already shut down:", this);
            if(this._previousShutdownStack)
                console.log("Previous shutdown stack:", this._previousShutdownStack);
            return;
        }

        // This will shut down everything associated with this actor, as well as any child actors.
        this.shutdownSignal.abort();

        // All of our children should have shut down and removed themselves from our child list.
        if(this.children.length != 0)
        {
            for(let child of this.children)
                console.warn("Child of", this, "didn't shut down:", child);
        }

        // If we have a parent, remove ourself from it.  Otherwise, remove ourself from
        // _topActors.
        if(this.parent)
            this.parent._childRemoved(this);
        else
        {
            let idx = Actor._topActors.indexOf(this);
            console.assert(idx != -1);
            Actor._topActors.splice(idx, 1);
        }
    }

    // Create an element from template HTML.  If name isn't null, the HTML will be cached
    // using name as a key.
    createTemplate({name=null, html, makeSVGUnique=true})
    {
        // Cache templates on the class.  This doesn't share cache between subclasses, but
        // it lets us reuse templates between instances.
        let cls = this.__proto__;
        cls.templates ??= {};
        let template = name? cls.templates[name]:null;
        if(!template)
        {
            template = document.createElement("template");
            template.innerHTML = html;
            helpers.replaceInlines(template.content);
            
            cls.templates[name] = template;
        }

        return helpers.createFromTemplate(template, { makeSVGUnique });
    }

    // For convenience, return options to add to an event listener and other objects that
    // take an AbortSignal to shut down when the rest of the actor does.
    //
    // node.addEventListener("event", func, this._signal);
    // node.addEventListener("event", func, { capture: true, ...this._signal });
    get _signal()
    {
        return { signal: this.shutdownSignal.signal };
    }

    _childAdded(child)
    {
        this.children.push(child);
    }

    _childRemoved(child)
    {
        let idx = this.children.indexOf(child);
        if(idx == -1)
        {
            console.warn("Actor wasn't in the child list:", child);
            return;
        }

        this.children.splice(idx, 1);
    }

    // Yield all parents of this node.  If includeSelf is true, yield ourself too.
    *ancestors({includeSelf=false}={})
    {
        if(includeSelf)
            yield this;

        let count = 0;
        let parent = this.parent;
        while(parent != null)
        {
            yield parent;
            parent = parent.parent;

            count++;
            if(count > 10000)
                throw new Error("Recursion detected");
        }
    }

    // Yield all descendants of this node, depth-first.  If includeSelf is true, yield ourself too.
    *descendents({includeSelf=false}={})
    {
        if(includeSelf)
            yield this;

        for(let child of this.children)
        {
            yield child;
            for(let childDescendants of child.descendents())
                yield childDescendants;
        }
    }

    // Non-widget actors are always visible.
    get visible() { return true; }

    // Return true if we and all of our ancestors are visible.
    //
    // This is based on this.visible.  For widgets that animate on and off, this becomes false
    // as soon as the widget begins hiding (this.visible becomes false), without waiting for the
    // animation to finish (this.actuallyVisible).  This allows child widgets to animate away
    // along with the parent.
    get visibleRecursively()
    {
        for(let node of this.ancestors({includeSelf: true}))
        {
            if(!node.visible)
                return false;
        }

        return true;
    }

    // Call visibleRecursivelyChanged on the hierarchy.
    _callVisibleRecursivelyChanged()
    {
        for(let actor of this.descendents({includeSelf: true}))
        {
            if(actor.visibleRecursivelyChanged)
                actor.visibleRecursivelyChanged(this);
        }
    }

    // This is called when visibleRecursively may have changed.
    visibleRecursivelyChanged() { }
}