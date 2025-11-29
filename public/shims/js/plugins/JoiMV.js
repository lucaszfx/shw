
(function(){

    var parameters = PluginManager.parameters('JoiMV');

    const joiDownscaleImage = function(image, scale)
    {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = Math.floor(image.width*scale);
        canvas.height = Math.floor(image.height*scale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        var nImage = new Image();
        nImage.src = canvas.toDataURL('image/png');
        nImage.width = canvas.width;
        nImage.height = canvas.height;
        return nImage;
    }

    var _sceneManger_initAudio = SceneManager.initAudio;
    SceneManager.initAudio = function() {
        var noAudio = Utils.isOptionValid('noaudio');
        WebAudio.initialize(noAudio);
    };

    const isWebGLSupported = !!document.createElement('canvas').getContext('webgl')

    var _utils_isOptionValid = Utils.isOptionValid;
    Utils.isOptionValid = function(name) {
        if (name == 'canvas'){
            return !(isWebGLSupported && NWJSApi.isWebGL());
        } else if (name == 'webgl'){
            return isWebGLSupported && NWJSApi.isWebGL();
        } else if (name == 'test'){
            return false;
        }
        return _utils_isOptionValid(name);
    };

    Graphics.isWebGL = function () {
        return isWebGLSupported && NWJSApi.isWebGL();
    };

    var _datamanager_loadGlobalInfo = DataManager.loadGlobalInfo;
    DataManager.loadGlobalInfo = function() {
        var json;
        try {
            json = StorageManager.load(0);
        } catch (e) {
            console.error(e);
            return [];
        }
        if (json) {
            var globalInfo = JSON.parse(json);
            for (var i = 1; i < globalInfo.length; i++) {
                if(globalInfo[i]){
                    if (!StorageManager.exists(i)) {
                        delete globalInfo[i];
                    }
                }
            }
            return globalInfo;
        } else {
            return [];
        }
    };

    var _storageManager_isLocalMode = StorageManager.isLocalMode;
    StorageManager.isLocalMode = function() {
        return true;
    };

    Utils.isMobileDevice = function() {
        return false;
    };

    Utils.isAndroidChrome = function() {
        return false;
    };

    Utils.isNwjs = function() {
        return true;
    };

    if(typeof Decrypter !== "undefined")
    {
        Decrypter.checkImgIgnore = function(url){
            for(var cnt = 0; cnt < this._ignoreList.length; cnt++) {
                if(url === this._ignoreList[cnt]) return true;
            }

            if(url === "img/system/Loading.png") return true;
            return false;
        };
    }

    Game_Interpreter.prototype.videoFileExt = function() {
        return '.webm';
    };

    Graphics.canPlayVideoType = function(type) {
        return true;
    };

    Graphics._cssFontLoading =  document.fonts && document.fonts.ready && document.fonts.ready.then;

    if(typeof Bitmap.prototype.bltImage == "undefined")
    {
        Bitmap.prototype.bltImage = function(source, sx, sy, sw, sh, dx, dy, dw, dh) {
            dw = dw || sw;
            dh = dh || sh;
            if (sx >= 0 && sy >= 0 && sw > 0 && sh > 0 && dw > 0 && dh > 0 &&
                sx + sw <= source.width && sy + sh <= source.height) {
                this._context.globalCompositeOperation = 'source-over';
                this._context.drawImage(source._image, sx, sy, sw, sh, dx, dy, dw, dh);
                this._setDirty();
            }
        };
    }

    Sprite.prototype._needsTint = function() {
        if(this._lastTone && this._lastBlendColor && (this._lastTone === this._colorTone) && (this._lastBlendColor === this._blendColor)) return false;
        var tone = this._colorTone;
        var needsTint = tone[0] || tone[1] || tone[2] || tone[3] || this._blendColor[3] > 0;

        if(needsTint){
            this._lastTone = tone;
            this._lastBlendColor = this._blendColor;
        }

        return needsTint
    };

    if(PIXI.VERSION.startsWith("4")){
        try{
            PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH;
            PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.HIGH;
        } catch(e){
        }

        PIXI.settings.ROUND_PIXELS = true;
        PIXI.settings.SPRITE_BATCH_SIZE = 2048;
        PIXI.settings.WRAP_MODE = PIXI.WRAP_MODES.CLAMP;

        try{ PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;} catch(e){}
        try{ PIXI.settings.ROUND_PIXELS = true;} catch(e){}

        //Fix several issues (blinking, black screen, etc) on some devices
        PIXI.settings.CAN_UPLOAD_SAME_BUFFER = false;
        Graphics._createRenderer = function() {
            PIXI.dontSayHello = false;
            var width = this._width;
            var height = this._height;
            var options = {
                view: this._canvas,
                preserveDrawingBuffer: false,
                clearBeforeRender: false,
                legacy: true,
            };
            try {
                switch (this._rendererType) {
                case 'canvas':
                    this._renderer = new PIXI.CanvasRenderer(width, height, options);
                    break;
                case 'webgl':
                    this._renderer = new PIXI.WebGLRenderer(width, height, options);
                    break;
                default:
                    this._renderer = PIXI.autoDetectRenderer(width, height, options);
                    break;
                }

                if(this._renderer && this._renderer.textureGC)
                    this._renderer.textureGC.maxIdle = 1;

            } catch (e) {
                this._renderer = null;
            }

            if(this.isWebGL() && this._renderer.gl) {
                try {
                    window.maximumTextureSize = this._renderer.gl.getParameter(this._renderer.gl.MAX_TEXTURE_SIZE);
                } catch(e){
                    window.maximumTextureSize = 4096;
                }
            }
        };

        Spriteset_Base.prototype.createWebGLToneChanger = function() {
            var margin = 48;
            var width = Graphics.width + margin * 2;
            var height = Graphics.height + margin * 2;
            this._toneFilter = new ToneFilter();
            this._toneFilter.enabled = false;
            this._baseSprite.filters = [this._toneFilter];
            this._baseSprite.filterArea = new Rectangle(-margin, -margin, width, height);
        };

        Spriteset_Base.prototype.updateWebGLToneChanger = function() {
            var tone = this._tone;
            this._toneFilter.reset();
            if (tone[0] || tone[1] || tone[2] || tone[3]) {
                this._toneFilter.enabled = true;
                this._toneFilter.adjustTone(tone[0], tone[1], tone[2]);
                this._toneFilter.adjustSaturation(-tone[3]);
            } else {
                this._toneFilter.enabled = false;
            }
        };

        Graphics.render = function(stage) {
            if (this._skipCount <= 0) {
                var startTime = Date.now();
                if (stage) {
                    this._renderer.render(stage);
                }
                var endTime = Date.now();
                var elapsed = endTime - startTime;
                this._skipCount = Math.min(Math.floor(elapsed / 15), this._maxSkip);
                this._rendered = true;
            } else {
                this._skipCount--;
                this._rendered = false;
            }
            this.frameCount++;
        };

        //Decrease the maximum sprite count
        Weather.prototype._updateAllSprites = function() {
            var maxSprites = Math.floor(this.power * 6);
            while (this._sprites.length < maxSprites) {
                this._addSprite();
            }
            while (this._sprites.length > maxSprites) {
                this._removeSprite();
            }
            this._sprites.forEach(function(sprite) {
                this._updateSprite(sprite);
                sprite.x = sprite.ax - this.origin.x;
                sprite.y = sprite.ay - this.origin.y;
            }, this);
        };
    }

    const joiSceneManagerUpdateMain = SceneManager.updateMain;

    SceneManager.updateMainFluid = function() {
        if (Utils.isMobileSafari()) {
            this.changeScene();
            this.updateScene();
        } else {
            var newTime = this._getTimeInMsWithoutMobileSafari();
            var fTime = (newTime - this._currentTime) / 1000;
            if (fTime > 0.25) fTime = 0.25;
            this._currentTime = newTime;
            this._accumulator += fTime;
            while (this._accumulator >= this._deltaTime) {
                this.updateInputData();
                this.changeScene();
                this.updateScene();
                this._accumulator -= this._deltaTime;
            }
        }
        this.renderScene();
        this.requestUpdate();
    };

    SceneManager.updateMainFast = function() {
        this.updateInputData();
        this.changeScene();
        this.updateScene();
        this.renderScene();
        this.requestUpdate();
    };

    SceneManager.updateMain = function() {
        if(NWJSApi.getFramerate() > 60.0)
        {
            try
            {
                this.updateMainFluid();
            }
            catch(e)
            {
                joiSceneManagerUpdateMain.apply(this);
            }
        }
        else
        {
            this.updateMainFast();
        }
    };

    SceneManager.snapForBackground = function() {
        this._backgroundBitmap = this.snap();
    };

    Tilemap.prototype._compareChildOrder = function(a, b) {
        if (a.z === b.z) {
            if (a.y === b.y)
                return a.spriteId - b.spriteId;
            return a.y - b.y;
        }
        return a.z - b.z;
    };

    const joiBitmapCreateBaseTexture = Bitmap.prototype._createBaseTexture;
    Bitmap.prototype._createBaseTexture = function(source)
    {
        var origWidth = source.width;
        var origHeight = source.height;

        var tmpSource = source;

        if((source instanceof Image) && !!(window.maximumTextureSize) && NWJSApi.shouldDownscaleBitmaps())
        {
            if(Math.max(origWidth, origHeight) > window.maximumTextureSize)
            {
                var scale = window.maximumTextureSize / Math.max(origWidth, origHeight);
                tmpSource = joiDownscaleImage(source, scale);
                this._image = tmpSource;

                this._canvas.width = Math.floor(origWidth * scale);
                this._canvas.height = Math.floor(origHeight * scale);
                this._baseTexture.width = Math.floor(origWidth * scale);
                this._baseTexture.height = Math.floor(origHeight * scale);

                this._scale = scale;
            }
        }

        joiBitmapCreateBaseTexture.apply(this, [tmpSource]);
        this._baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this.origWidth = origWidth;
        this.origHeight = origHeight;
    }

    const isBitmapScaled = function(bitmap)
    {
        return (!!(window.maximumTextureSize) && NWJSApi.shouldDownscaleBitmaps() &&
            ((bitmap.origWidth > window.maximumTextureSize) || (bitmap.origHeight > window.maximumTextureSize)));
    }

    const joiSpriteOnBitmapLoad = Sprite.prototype._onBitmapLoad;
    Sprite.prototype._onBitmapLoad = function(bitmapLoaded) {
        if((bitmapLoaded === this._bitmap) && isBitmapScaled(this._bitmap))
        {
            this.scale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);

            if(this._bitmap._image && !this._bitmap._image.complete)
                this._bitmap._image.addEventListener('load', (event) => {
                    joiSpriteOnBitmapLoad.apply(this, [bitmapLoaded]);
                });
        }

        joiSpriteOnBitmapLoad.apply(this, [bitmapLoaded]);
    };

    const joiTilingSpriteOnBitmapLoad = TilingSprite.prototype._onBitmapLoad;
    TilingSprite.prototype._onBitmapLoad = function () {
        if(isBitmapScaled(this._bitmap))
        {
            this.tileScale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);
            this.scale = new PIXI.Point(1, 1);

            if(this._bitmap._image && !this._bitmap._image.complete)
                this._bitmap._image.addEventListener('load', (event) => {
                    joiTilingSpriteOnBitmapLoad.apply(this);
                });
        }

        joiTilingSpriteOnBitmapLoad.apply(this);
    };

    const joiSpriteStateIconUpdateFrame = Sprite_StateIcon.prototype.updateFrame;
    Sprite_StateIcon.prototype.updateFrame = function() {
        if(isBitmapScaled(this._bitmap))
        {
            var pw = Sprite_StateIcon._iconWidth * this._bitmap._scale;
            var ph = Sprite_StateIcon._iconHeight * this._bitmap._scale;
            var sx = Math.floor(this._iconIndex % 16 * pw);
            var sy = Math.floor(Math.floor(this._iconIndex / 16) * ph);
            this.setFrame(sx, sy, Math.floor(pw), Math.floor(ph));

            this.scale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);
        }
        else
        {
            joiSpriteStateIconUpdateFrame.apply(this);
        }
    };

    const joiSpriteBalloonUpdateFrame = Sprite_Balloon.prototype.updateFrame;
    Sprite_Balloon.prototype.updateFrame = function() {
        if(isBitmapScaled(this._bitmap))
        {
            var w = 48 * this._bitmap._scale;
            var h = 48 * this._bitmap._scale;
            var sx = Math.floor(this.frameIndex() * w);
            var sy = Math.floor((this._balloonId - 1) * h);
            this.setFrame(sx, sy, Math.floor(w), Math.floor(h));

            this.scale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);
        }
        else
        {
            joiSpriteBalloonUpdateFrame.apply(this);
        }
    };

    const joiWindowBaseDrawIcon = Window_Base.prototype.drawIcon;
    Window_Base.prototype.drawIcon = function(iconIndex, x, y) {
        var bitmap = ImageManager.loadSystem('IconSet');
        if(isBitmapScaled(bitmap))
        {
            var pw = Window_Base._iconWidth * bitmap._scale;
            var ph = Window_Base._iconHeight * bitmap._scale;
            var sx = Math.floor(iconIndex % 16 * pw);
            var sy = Math.floor(Math.floor(iconIndex / 16) * ph);
            this.contents.bltImage(bitmap, sx, sy, Math.floor(pw), Math.floor(ph), x, y, Window_Base._iconWidth, Window_Base._iconHeight);
        }
        else
        {
            joiWindowBaseDrawIcon.apply(this, [iconIndex, x, y])
        }
    };
})();