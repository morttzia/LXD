(function(){
  var items=Array.from(document.querySelectorAll('.nav-item'));
  var sharedDropdown=document.getElementById('shared-dropdown');
  if(!sharedDropdown) return;
  var panels=Array.from(sharedDropdown.querySelectorAll('.dropdown-panel'));
  var closeTimer;
  var currentTarget = null;
  
  function closeAll(){
    items.forEach(function(i){i.classList.remove('dd-open')});
    sharedDropdown.classList.remove('open');
    panels.forEach(function(p){p.classList.remove('active')});
    currentTarget = null;
  }
  
  function open(item, force){
    clearTimeout(closeTimer);
    var t=item.querySelector('.dd-trigger');
    var targetId=t?t.getAttribute('data-target'):null;
    if(!targetId) { closeAll(); return; }
    
    if(currentTarget === targetId && sharedDropdown.classList.contains('open')) return;
    currentTarget = targetId;
    
    items.forEach(function(i){i.classList.remove('dd-open')});
    item.classList.add('dd-open');
    
    var panel=document.getElementById(targetId);
    if(!panel) return;
    
    panels.forEach(function(p){p.classList.remove('active')});
    panel.classList.add('active');
    
    sharedDropdown.classList.add('open');
    
    requestAnimationFrame(function(){
      var containerRect = item.parentElement.getBoundingClientRect();
      var shellRect = document.getElementById('nav-shell').getBoundingClientRect();
      var vw = window.innerWidth;
      
      var pw = panel.offsetWidth;
      var ph = panel.offsetHeight;
      
      sharedDropdown.style.width = pw + 'px';
      sharedDropdown.style.height = ph + 'px';
      

      var left = (containerRect.left + containerRect.width / 2) - (pw / 2) - shellRect.left;
      
      var shift = 0;
      var absoluteRightEdge = containerRect.left + containerRect.width / 2 + pw / 2;
      var absoluteLeftEdge = containerRect.left + containerRect.width / 2 - pw / 2;
      
      if(absoluteRightEdge > vw - 12) shift = (vw - 12) - absoluteRightEdge;
      if(absoluteLeftEdge + shift < 12) shift = 12 - absoluteLeftEdge;
      
      sharedDropdown.style.left = (left + shift) + 'px';
    });
  }
  
  items.forEach(function(item){
    item.addEventListener('mouseenter',function(){open(item,true)});
    var t=item.querySelector('.dd-trigger');
    if(t)t.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();open(item,false)});
  });
  
  sharedDropdown.addEventListener('mouseenter', function(){ clearTimeout(closeTimer); });
  sharedDropdown.addEventListener('mouseleave', function(){ closeTimer = setTimeout(closeAll, 100); });
  var dn=document.getElementById('desktop-nav');
  if(dn) dn.addEventListener('mouseleave', function(){ closeTimer = setTimeout(closeAll, 100); });
  document.addEventListener('click',function(e){if(!e.target.closest('.nav-item') && !e.target.closest('.nav-dropdown-shared'))closeAll()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll()});
})();
