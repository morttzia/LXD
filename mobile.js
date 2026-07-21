function toggleMobile(){document.getElementById('mobile-overlay').classList.toggle('open')}
function toggleAcc(id){document.getElementById(id).classList.toggle('open')}
function toggleModelAcc(id,chev){
  var el=document.getElementById(id);if(!el)return;
  var isOpen=el.classList.contains('open');
  document.querySelectorAll('.model-acc-content.open').forEach(function(o){
    o.classList.remove('open');o.style.maxHeight='0px';
    var c=o.parentElement.querySelector('.chev');if(c)c.classList.remove('rotate-180');
  });
  if(!isOpen){el.classList.add('open');el.style.maxHeight=el.scrollHeight+'px';if(chev)chev.classList.add('rotate-180');}
}
