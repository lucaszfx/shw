(function () {

    var parameters = PluginManager.parameters('JoiMZ');

    const joiDownscaleImage = function (image, scale) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = Math.floor(image.width * scale);
        canvas.height = Math.floor(image.height * scale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        var nImage = new Image();
        nImage.src = canvas.toDataURL('image/png');
        nImage.width = canvas.width;
        nImage.height = canvas.height;
        return nImage;
    }

    const joiGraphicsCreatePixiApp = Graphics._createPixiApp;
    Graphics._createPixiApp = function () {
        joiGraphicsCreatePixiApp.apply(this, []);

        if (this._app.renderer.context)
            window.maximumTextureSize = this._app.renderer.context.gl.getParameter(this._app.renderer.context.gl.MAX_TEXTURE_SIZE);
    };

    if (typeof Bitmap.prototype.bltImage == "undefined") {
        Bitmap.prototype.bltImage = function (source, sx, sy, sw, sh, dx, dy, dw, dh) {
            dw = dw || sw;
            dh = dh || sh;
            if (sx >= 0 && sy >= 0 && sw > 0 && sh > 0 && dw > 0 && dh > 0 &&
                sx + sw <= source.width && sy + sh <= source.height) {
                this._context.globalCompositeOperation = 'source-over';
                this._context.drawImage(source._image, sx, sy, sw, sh, dx, dy, dw, dh);
            }
        };
    }

    const joiBitmapCreateBaseTexture = Bitmap.prototype._createBaseTexture;
    Bitmap.prototype._createBaseTexture = function (source) {
        var origWidth = source.width;
        var origHeight = source.height;

        var tmpSource = source;
        if ((source instanceof Image) && !!(window.maximumTextureSize) && NWJSApi.shouldDownscaleBitmaps()) {
            if (Math.max(origWidth, origHeight) > window.maximumTextureSize) {
                var scale = window.maximumTextureSize / Math.max(origWidth, origHeight);
                tmpSource = joiDownscaleImage(source, scale);
                this._image = tmpSource;
                this._scale = scale;
            }
        }

        joiBitmapCreateBaseTexture.apply(this, [tmpSource]);

        if (this._scale) {
            if (this._canvas) {
                this._canvas.width = Math.floor(origWidth * scale);
                this._canvas.height = Math.floor(origHeight * scale);
            }

            this._baseTexture.width = Math.floor(origWidth * scale);
            this._baseTexture.height = Math.floor(origHeight * scale);
        }

        this._baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this.origWidth = origWidth;
        this.origHeight = origHeight;
    };

    const isBitmapScaled = function (bitmap) {
        return (!!(window.maximumTextureSize) && NWJSApi.shouldDownscaleBitmaps() &&
            ((bitmap.origWidth > window.maximumTextureSize) || (bitmap.origHeight > window.maximumTextureSize)));
    }

    const joiSpriteOnBitmapLoad = Sprite.prototype._onBitmapLoad;
    Sprite.prototype._onBitmapLoad = function (bitmapLoaded) {
        if ((bitmapLoaded === this._bitmap) && isBitmapScaled(this._bitmap)) {
            this.scale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);

            if (this._bitmap._image && !this._bitmap._image.complete)
                this._bitmap._image.addEventListener('load', (event) => {
                    joiSpriteOnBitmapLoad.apply(this, [bitmapLoaded]);
                });
        }

        joiSpriteOnBitmapLoad.apply(this, [bitmapLoaded]);
    };

    const joiTilingSpriteOnBitmapLoad = TilingSprite.prototype._onBitmapLoad;
    TilingSprite.prototype._onBitmapLoad = function () {
        if (isBitmapScaled(this._bitmap)) {
            this.tileScale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);
            this.scale = new PIXI.Point(1, 1);

            if (this._bitmap._image && !this._bitmap._image.complete)
                this._bitmap._image.addEventListener('load', (event) => {
                    joiTilingSpriteOnBitmapLoad.apply(this);
                });
        }

        joiTilingSpriteOnBitmapLoad.apply(this);
    };

    const joiSpriteStateIconUpdateFrame = Sprite_StateIcon.prototype.updateFrame;
    Sprite_StateIcon.prototype.updateFrame = function () {
        if (isBitmapScaled(this._bitmap)) {
            var pw = ImageManager.iconWidth * this._bitmap._scale;
            var ph = ImageManager.iconHeight * this._bitmap._scale;
            var sx = Math.floor((this._iconIndex % 16) * pw);
            var sy = Math.floor(Math.floor(this._iconIndex / 16) * ph);
            this.setFrame(sx, sy, Math.floor(pw), Math.floor(ph));

            this.scale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);
        }
        else {
            joiSpriteStateIconUpdateFrame.apply(this);
        }
    };

    const joiSpriteBalloonUpdateFrame = Sprite_Balloon.prototype.updateFrame;
    Sprite_Balloon.prototype.updateFrame = function () {
        if (isBitmapScaled(this._bitmap)) {
            var w = 48 * this._bitmap._scale;
            var h = 48 * this._bitmap._scale;
            var sx = Math.floor(this.frameIndex() * w);
            var sy = Math.floor((this._balloonId - 1) * h);
            this.setFrame(sx, sy, Math.floor(w), Math.floor(h));

            this.scale = new PIXI.Point(1 / this._bitmap._scale, 1 / this._bitmap._scale);
        }
        else {
            joiSpriteBalloonUpdateFrame.apply(this);
        }
    };

    const joiWindowBaseDrawIcon = Window_Base.prototype.drawIcon;
    Window_Base.prototype.drawIcon = function (iconIndex, x, y) {
        var bitmap = ImageManager.loadSystem('IconSet');
        if (isBitmapScaled(bitmap)) {
            var pw = ImageManager.iconWidth * bitmap._scale;
            var ph = ImageManager.iconHeight * bitmap._scale;
            var sx = Math.floor(iconIndex % 16 * pw);
            var sy = Math.floor(Math.floor(iconIndex / 16) * ph);
            this.contents.bltImage(bitmap, sx, sy, Math.floor(pw), Math.floor(ph), x, y, ImageManager.iconWidth, ImageManager.iconHeight);
        }
        else {
            joiWindowBaseDrawIcon.apply(this, [iconIndex, x, y])
        }
    };

    Graphics._setupPixi = function () {
        PIXI.utils.skipHello();
        PIXI.settings.GC_MAX_IDLE = 600;
        try{
            PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH;
            PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.HIGH;
            PIXI.settings.ROUND_PIXELS = true;
            PIXI.settings.SPRITE_BATCH_SIZE = 2048;
            PIXI.settings.WRAP_MODE = PIXI.WRAP_MODES.CLAMP;
            PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
            PIXI.settings.CAN_UPLOAD_SAME_BUFFER = false;
        } catch (e){}

    };

    Graphics._createPixiApp = function () {
        try {
            this._setupPixi();
            this._app = new PIXI.Application({
                view: this._canvas,
                preserveDrawingBuffer: false,
                clearBeforeRender: false,
                antialias: false,
                autoStart: false
            });
            this._app.ticker.remove(this._app.render, this._app);
            this._app.ticker.add(this._onTick, this);
        } catch (e) {
            this._app = null;
        }
    };

    Weather.prototype._updateAllSprites = function () {
        const maxSprites = Math.floor(this.power * 6);
        while (this._sprites.length < maxSprites) {
            this._addSprite();
        }
        while (this._sprites.length > maxSprites) {
            this._removeSprite();
        }
        for (const sprite of this._sprites) {
            this._updateSprite(sprite);
            sprite.x = sprite.ax - this.origin.x;
            sprite.y = sprite.ay - this.origin.y;
        }
    };

})();