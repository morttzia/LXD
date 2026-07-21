var io=new IntersectionObserver(function(entries){
  entries.forEach(function(e){if(!e.isIntersecting)return;e.target.classList.add('in');io.unobserve(e.target)});
},{threshold:0.15,rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal,.words-reveal,.line-reveal,.label-reveal').forEach(function(el){io.observe(el)});

(function(){
  var ps=document.getElementById('products');if(!ps)return;
  var pio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){ps.classList.add('prod-in');pio.unobserve(ps)}})},{threshold:0.18,rootMargin:'0px 0px -5% 0px'});
  pio.observe(ps);
})();

(function(){
  var siteHeader=document.getElementById('site-header');
  var shell=document.getElementById('nav-shell');
  var navProgress=document.getElementById('nav-progress');
  var heroPattern=document.getElementById('hero-pattern');
  var heroContent=document.getElementById('hero-content');
  var ticking=false;
  var docH=document.documentElement.scrollHeight-window.innerHeight;
  window.addEventListener('resize', function(){
    docH=document.documentElement.scrollHeight-window.innerHeight;
  }, {passive:true});
  
  var dynamicLogos = document.querySelectorAll('.dynamic-logo');
  var currentLogoText = '';
  var sProducts = document.getElementById('products');
  var sSpying = document.getElementById('spyingdot');
  var sModels = document.getElementById('models');
  var sKaaf = document.getElementById('kaaf');
  
  function setLogoText(newText) {
    if(currentLogoText === newText) return;
    currentLogoText = newText;
    
    dynamicLogos.forEach(function(l) {
      l.style.transition = 'opacity 0.3s ease, filter 0.3s ease, transform 0.3s ease';
      l.style.opacity = '0';
      l.style.filter = 'blur(4px)';
      l.style.transform = 'translateY(-2px)';
      setTimeout(function(){
        l.textContent = newText;
        l.style.opacity = '1';
        l.style.filter = 'blur(0px)';
        l.style.transform = 'translateY(0)';
      }, 300);
    });
  }

  function onFrame(){
    var y=window.scrollY;var scrolled=y>24;
    siteHeader.classList.toggle('nav-scrolled',scrolled);
    shell.classList.toggle('nav-scrolled',scrolled);
    navProgress.style.transform='scaleX('+(docH>0?(y/docH):0)+')';
    if(heroContent && y <= 650){
      var fade=Math.max(0,1-y/500);
      heroContent.style.opacity=fade;
      heroContent.style.transform='translate3d(0,'+(y*0.08)+'px,0)';
    }
    
    var threshold = y + window.innerHeight / 3;
    var newText = '';
    
    if (sKaaf && threshold >= sKaaf.offsetTop) {
       newText = ' Kaaf Notebook';
    } else if (sModels && threshold >= sModels.offsetTop) {
       newText = ' AI Models';
    } else if (sSpying && threshold >= sSpying.offsetTop) {
       newText = ' SpyingDot';
    } else if (sProducts && threshold >= sProducts.offsetTop) {
       newText = ' Products';
    }
    
    if (y + window.innerHeight >= document.documentElement.scrollHeight - 60) {
       newText = '';
    }
    
    setLogoText(newText);
    
    ticking=false;
  }
  window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(onFrame);ticking=true}},{passive:true});
  onFrame();
})();
