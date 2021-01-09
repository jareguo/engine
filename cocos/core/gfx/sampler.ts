/*
 Copyright (c) 2020 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

/**
 * @packageDocumentation
 * @module gfx
 */

import { Color } from './define-class';
import { Device } from './device';
import { Address, ComparisonFunc, Filter, Obj, ObjectType } from './define';

export class SamplerInfo {
    declare private _token: never; // to make sure all usages must be an instance of this exact class, not assembled from plain object

    constructor (
        public minFilter: Filter = Filter.LINEAR,
        public magFilter: Filter = Filter.LINEAR,
        public mipFilter: Filter = Filter.NONE,
        public addressU: Address = Address.WRAP,
        public addressV: Address = Address.WRAP,
        public addressW: Address = Address.WRAP,
        public maxAnisotropy: number = 16,
        public cmpFunc: ComparisonFunc = ComparisonFunc.NEVER,
        public borderColor: Color = new Color(),
        public minLOD: number = 0,
        public maxLOD: number = 0,
        public mipLODBias: number = 0.0,
    ) {}
}

/**
 * @en GFX sampler.
 * @zh GFX 采样器。
 */
export abstract class Sampler extends Obj {
    get minFilter () { return this._minFilter; }
    get magFilter () { return this._magFilter; }
    get mipFilter () { return this._mipFilter; }
    get addressU () { return this._addressU; }
    get addressV () { return this._addressV; }
    get addressW () { return this._addressW; }
    get maxAnisotropy () { return this._maxAnisotropy; }
    get cmpFunc () { return this._cmpFunc; }
    get borderColor () { return this._borderColor; }
    get minLOD () { return this._minLOD; }
    get maxLOD () { return this._maxLOD; }
    get mipLODBias () { return this._mipLODBias; }

    protected _device: Device;

    protected _minFilter: Filter = Filter.LINEAR;
    protected _magFilter: Filter = Filter.LINEAR;
    protected _mipFilter: Filter = Filter.NONE;
    protected _addressU: Address = Address.WRAP;
    protected _addressV: Address = Address.WRAP;
    protected _addressW: Address = Address.WRAP;
    protected _maxAnisotropy = 16;
    protected _cmpFunc: ComparisonFunc = ComparisonFunc.NEVER;
    protected _borderColor: Color = new Color();
    protected _minLOD = 0;
    protected _maxLOD = 0;
    protected _mipLODBias = 0.0;

    constructor (device: Device) {
        super(ObjectType.SAMPLER);
        this._device = device;
    }

    public abstract initialize (info: SamplerInfo): boolean;

    public abstract destroy (): void;
}
