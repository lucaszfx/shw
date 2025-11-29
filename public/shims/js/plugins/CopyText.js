(function() {
   window.copyText = "";
   window.clip = window.Clipboard.get();

   const copyText_Window_Base_drawText = Window_Base.prototype.drawText;
   Window_Base.prototype.drawText = function(text, x, y, maxWidth, align) {
       window.copyText += text + " ";
       copyText_Window_Base_drawText.call(this, text, x, y, maxWidth, align);
   }

   const copyText_Window_Base_drawTextEx = Window_Base.prototype.drawTextEx;
   Window_Base.prototype.drawTextEx = function(text, x, y) {
       window.copyText += text + " ";
       copyText_Window_Base_drawTextEx.call(this, text, x, y);
   }

   const copyText_Window_Message_startMessage = Window_Message.prototype.startMessage;
   Window_Message.prototype.startMessage = function () {
	   window.copyText += this.convertEscapeCharacters($gameMessage.allText()) + " ";
       copyText_Window_Message_startMessage.call(this);
   };

   const copyText_Window_ScrollText_startMessage = Window_ScrollText.prototype.startMessage;
   Window_ScrollText.prototype.startMessage = function () {
	window.copyText += this.convertEscapeCharacters($gameMessage.allText()) + " ";
       copyText_Window_ScrollText_startMessage.call(this);
   }

    const copyText_Window_update = Window.prototype.update;
    Window.prototype.update = function() {
	copyText_Window_update.call(this);
	if(window.copyText.length > 0 & this.active){
	    window.clip.set(window.copyText);
            window.copyText = "";
	}

    };

})();
