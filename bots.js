(function(){
  var botsData=[
    {name:'Spying.Telegram',desc:'أتمتة وإدارة حسابات وقنوات التيليجرام بسهولة فائقة.',img:'https://i.ibb.co/CKrn538N/photo-5402234535660950716-y.jpg',link:'https://t.me/spyingtelegram_bot'},
    {name:'Spying.Instagram',desc:'أتمتة وإدارة حسابات ومنشورات الإنستغرام عبر التيليجرام.',img:'https://i.ibb.co/0ppdDVFB/photo-5384598515180312547-y.jpg',link:'https://t.me/spyinginstagram_bot'},
    {name:'Spying.Media',desc:'تنزيل الفيديوهات من يوتيوب ووسائل التواصل الاجتماعي فوراً. سريع وبدون علامة مائية.',img:'https://i.ibb.co/Ngr04PYx/photo-5359483182815846948-y.jpg',link:'https://t.me/spyingmedia_bot'},
    {name:'Spying.Music',desc:'ابحث عن الموسيقى بالكلمات والألحان، وليس فقط بالأسماء. صف ما تسمعه.',img:'https://i.ibb.co/Jw8Kn4KT/photo-5402234535660950717-y.jpg',link:'https://t.me/spyingmusic_bot'}
  ];
  var currentIndex=0,autoPlayInterval;
  var transitionTimeout=null;
  var menuContainer=document.getElementById('navigation-menu');
  var sectionContainer=document.getElementById('spyingdot');
  var indicator=document.getElementById('menu-indicator');
  var contentContainer=document.getElementById('bot-content-container');
  var domImage=document.getElementById('bot-image');
  var domTitle=document.getElementById('bot-title');
  var domDesc=document.getElementById('bot-description');
  var docBtn=document.getElementById('dynamic-doc-btn');
  var docBtnText=document.getElementById('doc-btn-text');
  var svgCanvas=document.getElementById('connecting-line-canvas');
  var svgPath=document.getElementById('svg-path');
  var svgStartDot=document.getElementById('svg-start-dot');
  var svgEndDot=document.getElementById('svg-end-dot');
  var btns=[];
  if(!menuContainer)return;
  var currentX1=0, currentY1=0, currentX2=0, currentY2=0;
  var targetX1=0, targetY1=0, targetX2=0, targetY2=0;
  var isAnimatingLine = false;

  function buildMenu(){
    botsData.forEach(function(bot,i){
      var btn=document.createElement('button');
      btn.className='bot-menu-item relative z-[1] flex w-full items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-medium text-white/40 transition-colors duration-300 sm:text-sm lg:w-[180px] lg:justify-start lg:px-6 lg:py-2.5';
      btn.dir='ltr';
      btn.textContent=bot.name;
      btn.addEventListener('click',function(){changeBot(i)});
      btn.addEventListener('mouseenter',function(){changeBot(i)});
      btns.push(btn);menuContainer.appendChild(btn);
    });
  }
  function moveIndicator(btn){
    if(!btn||!indicator)return;
    indicator.style.width=btn.offsetWidth+'px';
    indicator.style.height=btn.offsetHeight+'px';
    indicator.style.transform='translate('+btn.offsetLeft+'px,'+btn.offsetTop+'px)';
    indicator.style.opacity='1';
  }
  function updateMenuStyles(idx){
    btns.forEach(function(b,i){
      if(i===idx){b.classList.add('text-black','font-semibold');b.classList.remove('text-white/40')}
      else{b.classList.add('text-white/40');b.classList.remove('text-black','font-semibold')}
    });
    moveIndicator(btns[idx]);
  }
  function calculateTargetLine(){
    var activeBtn=btns[currentIndex];if(!activeBtn)return;
    var svgRect=svgCanvas.getBoundingClientRect();
    var startRect=contentContainer.getBoundingClientRect();
    var endRect=activeBtn.getBoundingClientRect();
    if(startRect.width===0||endRect.width===0)return;
    targetX1=(startRect.left-svgRect.left)-12;
    targetY1=(startRect.top-svgRect.top)+40;
    var isDesktop=window.innerWidth>=1024;
    var endOffset=isDesktop?endRect.width:(endRect.width/2);
    targetX2=(endRect.left-svgRect.left)+endOffset+14;
    targetY2=(endRect.top-svgRect.top)+(endRect.height/2);
    if(window.innerWidth<1024){targetX1=-100;targetX2=-100;}
  }

  function loopLineAnimation() {
    var prevX1 = currentX1, prevY1 = currentY1, prevX2 = currentX2, prevY2 = currentY2;
    currentX1 += (targetX1 - currentX1) * 0.15;
    currentY1 += (targetY1 - currentY1) * 0.15;
    currentX2 += (targetX2 - currentX2) * 0.15;
    currentY2 += (targetY2 - currentY2) * 0.15;

    if(Math.abs(targetX1 - currentX1) < 0.5 && Math.abs(targetX2 - currentX2) < 0.5 && Math.abs(targetY2 - currentY2) < 0.5) {
      currentX1 = targetX1; currentY1 = targetY1; currentX2 = targetX2; currentY2 = targetY2;
    }

    if (currentX1 !== prevX1 || currentY1 !== prevY1 || currentX2 !== prevX2 || currentY2 !== prevY2) {
      if(window.innerWidth<1024){
        svgPath.setAttribute('d','');svgStartDot.setAttribute('cx',-100);svgEndDot.setAttribute('cx',-100);
      } else {
        var distance=Math.abs(currentX2-currentX1);
        var h1=Math.max(30,distance*0.4),h2=Math.max(30,distance*0.15);
        svgPath.setAttribute('d','M '+currentX1+' '+currentY1+' L '+(currentX1-h1)+' '+currentY1+' L '+(currentX2+h2)+' '+currentY2+' L '+currentX2+' '+currentY2);
        svgStartDot.setAttribute('cx',currentX1);svgStartDot.setAttribute('cy',currentY1);
        svgEndDot.setAttribute('cx',currentX2);svgEndDot.setAttribute('cy',currentY2);
      }
    }
    requestAnimationFrame(loopLineAnimation);
  }

  function changeBot(idx){
    if(idx===currentIndex&&btns[idx]&&btns[idx].classList.contains('text-black')){moveIndicator(btns[idx]);calculateTargetLine();return}
    currentIndex=idx;var data=botsData[idx];
    updateMenuStyles(idx);calculateTargetLine();
    contentContainer.classList.remove('fade-in');contentContainer.classList.add('fade-out');
    docBtnText.style.transform='translateY(-15px)';docBtnText.style.opacity='0';
    if(transitionTimeout) clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(function(){
      domImage.src=data.img;domTitle.innerHTML='<span dir="ltr">'+data.name+'</span>';domDesc.textContent=data.desc;docBtn.href=data.link;
      contentContainer.classList.remove('fade-out');contentContainer.classList.add('fade-in');calculateTargetLine();
      docBtnText.style.transition='none';docBtnText.style.transform='translateY(15px)';docBtnText.textContent='تجربة البوت';
      void docBtnText.offsetWidth;
      docBtnText.style.transition='all .3s cubic-bezier(.4,0,.2,1)';docBtnText.style.transform='translateY(0)';docBtnText.style.opacity='1';
    },150);
  }
  function startAutoPlay(){clearInterval(autoPlayInterval);autoPlayInterval=setInterval(function(){changeBot((currentIndex+1)%botsData.length)},3500)}
  function stopAutoPlay(){clearInterval(autoPlayInterval);}

  buildMenu();
  updateMenuStyles(0);
  indicator.style.opacity='0';
  window.addEventListener('resize',function(){moveIndicator(btns[currentIndex]);calculateTargetLine()});
  if(window.ResizeObserver)new ResizeObserver(function(){moveIndicator(btns[currentIndex]);calculateTargetLine()}).observe(document.body);
  menuContainer.addEventListener('mouseenter', stopAutoPlay);
  menuContainer.addEventListener('mouseleave', startAutoPlay);

  requestAnimationFrame(function(){moveIndicator(btns[0])});
  document.fonts.ready.then(function(){
    moveIndicator(btns[currentIndex]);
    calculateTargetLine();
    currentX1=targetX1; currentY1=targetY1; currentX2=targetX2; currentY2=targetY2;
    svgCanvas.classList.add('show-canvas');
    startAutoPlay();
    loopLineAnimation();
  });
})();
