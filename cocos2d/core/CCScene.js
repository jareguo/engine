/****************************************************************************
 Copyright (c) 2015 Chukong Technologies Inc.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

var NIL = function () {};

/**
 * !#en
 * cc.Scene is a subclass of cc.Node that is used only as an abstract concept.<br/>
 * cc.Scene and cc.Node are almost identical with the difference that users can not modify cc.Scene manually.
 * !#zh
 * cc.Scene 是 cc.Node 的子类，仅作为一个抽象的概念。<br/>
 * cc.Scene 和 cc.Node 有点不同，用户不应直接修改 cc.Scene。
 * @class Scene
 * @extends _BaseNode
 */
cc.Scene = cc.Class({
    name: 'cc.Scene',
    extends: require('./utils/base-node'),

    ctor: function () {
        var sgNode = this._sgNode = new _ccsg.Scene();
        sgNode.retain();
        sgNode.setAnchorPoint(0.0, 0.0);
        this._anchorPoint.x = 0.0;
        this._anchorPoint.y = 0.0;

        this._activeInHierarchy = false;
        this._inited = !cc.game._isCloning;
    },

    destroy: function () {
        var children = this._children;
        var DontDestroy = cc.Object.Flags.DontDestroy;

        for (var i = 0, len = children.length; i < len; ++i) {
            var child = children[i];
            if (child.isValid) {
                if (!(child._objFlags & DontDestroy)) {
                    child.destroy();
                }
            }
        }

        this._super();
        this._activeInHierarchy = false;
    },

    _onHierarchyChanged: NIL,
    _onAnchorChanged: NIL,
    _onOpacityModifyRGBChanged: NIL,
    _onCascadeChanged: NIL,

    _load: function () {
        if ( ! this._inited) {
            this._onBatchCreated();
            this._inited = true;
        }
    },

    _activate: function (active) {
        active = (active !== false);
        var i, child, children = this._children, len = children.length;

        if (CC_DEV) {
            // register all nodes to editor
            for (i = 0; i < len; ++i) {
                child = children[i];
                child._registerIfAttached(active);
            }
        }

        this._activeInHierarchy = active;

        // invoke onLoad and onEnable
        for (i = 0; i < len; ++i) {
            child = children[i];
            if (child._active) {
                child._onActivatedInHierarchy(active);
            }
        }
    }
});

module.exports = cc.Scene;

if (CC_EDITOR) {
    var ERR = '"%s" is not defined in the Scene, it is only defined in child nodes.';
    Object.defineProperties(cc.Scene.prototype, {
        active: {
            get: function () {
                cc.error(ERR, 'active');
                return true;
            },
            set: function () {
                cc.error(ERR, 'active');
            }
        },
        activeInHierarchy: {
            get: function () {
                cc.error(ERR, 'activeInHierarchy');
                return true;
            },
        },
        getComponent: {
            get: function () {
                cc.error(ERR, 'getComponent');
                return function () {
                    return null;
                };
            }
        },
        addComponent: {
            get: function () {
                cc.error(ERR, 'addComponent');
                return function () {
                    return null;
                };
            }
        },
    });
}