/****************************************************************************
 Copyright (c) 2013-2016 Chukong Technologies Inc.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and  non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Chukong Aipu reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

var AnimationAnimator = require('../../animation/animation-animator');
var AnimationClip = require('../../animation/animation-clip');

function equalClips (clip1, clip2) {
    if (clip1 === clip2) {
        return true;
    }

    return clip1 && clip2 && (clip1.name === clip2.name || clip1._uuid === clip2._uuid);
}

/**
 * !#en The animation component is used to play back animations.
 * !#zh Animation 组件用于播放动画。你能指定动画剪辑到动画组件并从脚本控制播放。
 * @class Animation
 * @extends CCComponent
 */
var Animation = cc.Class({
    name: 'cc.Animation',
    extends: require('./CCComponent'),

    editor: CC_EDITOR && {
        menu: 'i18n:MAIN_MENU.component.others/Animation',
        help: 'i18n:COMPONENT.help_url.animation',
        executeInEditMode: true,
    },

    ctor: function () {
        // The actual implement for Animation
        this._animator = null;

        this._nameToState = {};
        this._didInit = false;

        this._currentClip = null;
    },

    properties: {

        _defaultClip: {
            default: null,
            type: AnimationClip,
        },

        /**
         * !#en Animation will play the default clip when start game.
         * !#zh 在勾选自动播放或调用 play() 时默认播放的动画剪辑。
         * @property defaultClip
         * @type {AnimationClip}
         */
        defaultClip: {
            type: AnimationClip,
            get: function () {
                return this._defaultClip;
            },
            set: function (value) {
                if (!CC_EDITOR || (cc.engine && cc.engine.isPlaying)) {
                    return;
                }

                this._defaultClip = value;

                if (!value) {
                    return;
                }

                var clips = this._clips;

                for (var i = 0, l = clips.length; i < l; i++) {
                    if (equalClips(value, clips[i])) {
                        return;
                    }
                }

                this.addClip(value);
            },
            tooltip: 'i18n:COMPONENT.animation.default_clip'
        },

        /**
         * !#en Current played clip.
         * !#zh 当前播放的动画剪辑。
         * @property currentClip
         * @type {AnimationClip}
         */
        currentClip: {
            get: function () {
                return this._currentClip;
            },
            set: function (value, force) {
                this._currentClip = value;

                if (CC_EDITOR && force && value) {
                    this._updateClip(value);
                }
            },
            type: AnimationClip,
            visible: false
        },

        /**
         * !#en All the clips used in this animation.
         * !#zh 通过脚本可以访问并播放的 AnimationClip 列表。
         * @property _clips
         * @type {AnimationClip[]}
         * @private
         */
        _clips: {
            default: [],
            type: [AnimationClip],
            tooltip: 'i18n:COMPONENT.animation.clips',
            visible: true
        },

        /**
         * !#en Whether the animation should auto play the default clip when start game.
         * !#zh 是否在运行游戏后自动播放默认动画剪辑。
         * @property playOnLoad
         * @type {Boolean}
         * @default true
         */
        playOnLoad: {
            default: false,
            tooltip: 'i18n:COMPONENT.animation.play_on_load'
        }
    },

    onLoad: function () {
        if (CC_EDITOR) return;

        this._init();

        if (this.playOnLoad && this._defaultClip) {
            var state = this.getAnimationState(this._defaultClip.name);
            this._animator.playState(state);
        }
    },

    onEnable: function () {
        this.resume();
    },

    onDisable: function () {
        this.pause();
    },

    ///////////////////////////////////////////////////////////////////////////////
    // Public Methods
    ///////////////////////////////////////////////////////////////////////////////

    /**
     * !#en Get all the clips used in this animation.
     * !#zh 获取动画组件上的所有动画剪辑。
     * @method getClips
     * @return {AnimationClip[]}
     */
    getClips: function () {
        return this._clips;
    },

    /**
     * !#en Plays an animation and stop other animations.
     * !#zh 播放当前或者指定的动画，并且停止当前正在播放动画。
     * @method play
     * @param {String} [name] - The name of animation to play. If no name is supplied then the default animation will be played.
     * @param {Number} [startTime] - play an animation from startTime
     * @return {AnimationState} - The AnimationState of playing animation. In cases where the animation can't be played (ie, there is no default animation or no animation with the specified name), the function will return null.
     * @example
     * var animCtrl = this.node.getComponent(cc.Animation);
     * animCtrl.play("linear");
     */
    play: function (name, startTime) {
        var state = this.playAdditive(name, startTime);
        var playingStates = this._animator.playingAnims;

        for (var i = playingStates.length; i >= 0; i--) {
            if (playingStates[i] === state) {
                continue;
            }

            this._animator.stopState(playingStates[i]);
        }

        return state;
    },

    /**
     * !#en
     * Plays an additive animation, it will not stop other animations.
     * If there are other animations playing, then will play several animations at the same time.
     * !#zh 播放当前或者指定的动画（将不会停止当前播放的动画）。
     * @method playAdditive
     * @param {String} [name] - The name of animation to play. If no name is supplied then the default animation will be played.
     * @param {Number} [startTime] - play an animation from startTime
     * @return {AnimationState} - The AnimationState of playing animation. In cases where the animation can't be played (ie, there is no default animation or no animation with the specified name), the function will return null.
     * @example
     * // linear_1 and linear_2 at the same time playing.
     * var animCtrl = this.node.getComponent(cc.Animation);
     * animCtrl.playAdditive("linear_1");
     * animCtrl.playAdditive("linear_2");
     */
    playAdditive: function (name, startTime) {
        this._init();
        var state = this.getAnimationState(name || this._defaultClip.name);
        if (state) {
            var animator = this._animator;

            if (animator.isPlaying && state.isPlaying) {
                if (state.isPaused) {
                    animator.resumeState(state);
                }
                else {
                    animator.stopState(state);
                    animator.playState(state, startTime);
                }
            }
            else {
                animator.playState(state, startTime);
            }

            this.currentClip = state.clip;
        }
        return state;
    },

    /**
     * !#en Stops an animation named name. If no name is supplied then stops all playing animations that were started with this Animation. <br/>
     * Stopping an animation also Rewinds it to the Start.
     * !#zh 停止当前或者指定的动画。如果没有指定名字，则停止所有动画。
     * @method stop
     * @param {String} [name] - The animation to stop, if not supplied then stops all playing animations.
     */
    stop: function (name) {
        if (!this._didInit) {
            return;
        }
        if (name) {
            var state = this._nameToState[name];
            if (state) {
                this._animator.stopState(state);
            }
        }
        else {
            this._animator.stop();
        }
    },

    /**
     * !#en Pauses an animation named name. If no name is supplied then pauses all playing animations that were started with this Animation.
     * !#zh 暂停当前或者指定的动画。如果没有指定名字，则暂停当前正在播放的动画。
     * @method pause
     * @param {String} [name] - The animation to pauses, if not supplied then pauses all playing animations.
     */
    pause: function (name) {
        if (!this._didInit) {
            return;
        }
        if (name) {
            var state = this._nameToState[name];
            if (state) {
                this._animator.pauseState(state);
            }
        }
        else {
            this._animator.pause();
        }
    },

    /**
     * !#en Resumes an animation named name. If no name is supplied then resumes all paused animations that were started with this Animation.
     * !#zh 重新播放指定的动画，如果没有指定名字，则重新播放当前正在播放的动画。
     * @method resume
     * @param {String} [name] - The animation to resumes, if not supplied then resumes all paused animations.
     */
    resume: function (name) {
        if (!this._didInit) {
            return;
        }
        if (name) {
            var state = this._nameToState[name];
            if (state) {
                this._animator.resumeState(state);
            }
        }
        else {
            this._animator.resume();
        }
    },

    /**
     * !#en Make an animation named name go to the specified time. If no name is supplied then make all animations go to the specified time.
     * !#zh 设置指定动画的播放时间。如果没有指定名字，则设置所有动画的播放时间。
     * @method setCurrentTime
     * @param {Number} [time] - The time to go to
     * @param {String} [name] - Specified animation name, if not supplied then make all animations go to the time.
     */
    setCurrentTime: function (time, name) {
        this._init();
        if (name) {
            var state = this._nameToState[name];
            if (state) {
                this._animator.setStateTime(state, time);
            }
        }
        else {
            for (var name in this._nameToState) {
                state = this._nameToState[name];
                this._animator.setStateTime(state, time);
            }
        }
    },

    /**
     * !#en Returns the animation state named name. If no animation with the specified name, the function will return null.
     * !#zh 获取当前或者指定的动画状态，如果未找到指定动画剪辑则返回 null。
     * @method getAnimationState
     * @param {String} name
     * @return {AnimationState}
     */
    getAnimationState: function (name) {
        this._init();
        var state = this._nameToState[name];

        if (CC_EDITOR && !state) {
            this._didInit = false;

            if (this.animator) {
                this.animator.stop();
            }

            this._init();
            state = this._nameToState[name];
        }

        if (state && !state.curveLoaded) {
            this._animator._reloadClip(state);
        }

        return state || null;
    },

    /**
     * !#en Adds a clip to the animation with name newName. If a clip with that name already exists it will be replaced with the new clip.
     * !#zh 添加动画剪辑，并且可以重新设置该动画剪辑的名称。
     * @method addClip
     * @param {AnimationClip} clip - the clip to add
     * @param {String} [newName]
     * @return {AnimationState} - The AnimationState which gives full control over the animation clip.
     */
    addClip: function (clip, newName) {
        if (!clip) {
            cc.warn('Invalid clip to add');
            return;
        }
        this._init();

        // add clip
        if (!cc.js.array.contains(this._clips, clip)) {
            this._clips.push(clip);
        }

        // replace same name clip
        newName = newName || clip.name;
        var oldState = this._nameToState[newName];
        if (oldState) {
            if (oldState.clip === clip) {
                return oldState;
            }
            else {
                var index = this._clips.indexOf(oldState.clip);
                if (index !== -1) {
                    this._clips.splice(index, 1);
                }
            }
        }

        // replace state
        var newState = new cc.AnimationState(clip, newName);
        this._nameToState[newName] = newState;
        return newState;
    },

    _removeStateIfNotUsed: function (state, force) {
        var needRemove = state.clip !== this._defaultClip && !cc.js.array.contains(this._clips, state.clip);
        if (force || needRemove) {
            if (state.isPlaying) {
                this.stop(state.name);
            }
            delete this._nameToState[state.name];
        }
    },

    /**
     * !#en Remove clip from the animation list. This will remove the clip and any animation states based on it.
     * !#zh
     * 从动画列表中移除指定的动画剪辑，<br/>
     * 如果动画剪辑正在播放并且 force 参数为 true，这会停止该动画剪辑，然后在移除该动画剪辑，反之为 false，则会停止该动画。
     * @method removeClip
     * @param {AnimationClip} clip
     * @param {Boolean} force If force is true, then will always remove the clip and any animation states based on it.
     */
    removeClip: function (clip, force) {
        if (!clip) {
            cc.warn('Invalid clip to remove');
            return;
        }
        this._init();

        this._clips = this._clips.filter(function (item) {
            return item !== clip;
        });

        var state;
        for (var name in this._nameToState) {
            state = this._nameToState[name];
            var stateClip = state.clip;
            if (stateClip === clip) {
                this._removeStateIfNotUsed(state, force);
            }
        }
    },

    /**
     * !#en
     * Samples animations at the current state.<br/>
     * This is useful when you explicitly want to set up some animation state, and sample it once.
     * !#zh 对当前动画进行采样。你可以手动将动画设置到某一个状态，然后采样一次。
     * @method sample
     */
    sample: function () {
        this._init();
        this._animator.sample();
    },

    ///////////////////////////////////////////////////////////////////////////////
    // Internal Methods
    ///////////////////////////////////////////////////////////////////////////////

    // Dont forget to call _init before every actual process in public methods.
    // Just invoking _init by onLoad is not enough because onLoad is called only if the entity is active.

    _init: function () {
        if (this._didInit) {
            return;
        }
        this._didInit = true;
        this._animator = new AnimationAnimator(this.node, this);
        this._createStates();
    },

    _createStates: function() {
        // create animation states
        var state = null;
        var defaultClipState = false;
        for (var i = 0; i < this._clips.length; ++i) {
            var clip = this._clips[i];
            if (clip) {
                state = new cc.AnimationState(clip);

                if (CC_EDITOR) {
                    this._animator._reloadClip(state);
                }

                this._nameToState[state.name] = state;
                if (equalClips(this._defaultClip, clip)) {
                    defaultClipState = state;
                }
            }
        }
        if (this._defaultClip && !defaultClipState) {
            state = new cc.AnimationState(this._defaultClip);

            if (CC_EDITOR) {
                this._animator._reloadClip(state);
            }

            this._nameToState[state.name] = state;
        }
    },

    _updateClip: (CC_TEST || CC_EDITOR) && function (clip, clipName) {
        this._init();

        clipName = clipName || clip.name;

        var oldState;
        for (var name in this._nameToState) {
            var state = this._nameToState[name];
            var stateClip = state.clip;
            if (equalClips(stateClip, clip)) {
                if (!clip._uuid) clip._uuid = stateClip._uuid;
                oldState = state;
                break;
            }
        }

        if (!oldState) {
            cc.error('Can\'t find state from clip [' + clipName + ']');
            return;
        }

        var clips = this._clips;
        var index = clips.indexOf(oldState.clip);
        clips[index] = clip;

        // clip name changed
        if (oldState.name !== clipName) {
            delete this._nameToState[oldState.name];
            this._nameToState[clipName] = oldState;
            oldState._name = clipName;
        }

        oldState._clip = clip;
        this._animator._reloadClip(oldState);
    }
});


cc.Animation = module.exports = Animation;
