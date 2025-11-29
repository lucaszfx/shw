(function(){

    var parameters = PluginManager.parameters('PluginOverridesMZ');

    Tilemap.Renderer.prototype._createInternalTextures = function() {
        this._destroyInternalTextures();
        for (let i = 0; i < Tilemap.Layer.MAX_GL_TEXTURES; i++) {
            const baseTexture = new PIXI.BaseRenderTexture();
            baseTexture.resize(2048, 2048);
            baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._internalTextures.push(baseTexture);
        }
    };

})();