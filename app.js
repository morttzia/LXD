document.querySelectorAll('[data-words]').forEach(function(el){
  var text=el.textContent.trim();var base=parseFloat(el.dataset.wordDelay||0);
  el.setAttribute('aria-label',text);
  el.innerHTML=text.split(/\s+/).map(function(w){return '<span class="wm" aria-hidden="true"><span class="w">'+w+'</span></span>'}).join(' ');
  el.querySelectorAll('.w').forEach(function(we,i){we.style.transitionDelay=(base+i*0.045)+'s'});
});
document.querySelectorAll('.reveal[data-delay]').forEach(function(el){el.style.transitionDelay=(parseInt(el.dataset.delay)/1000)+'s'});
