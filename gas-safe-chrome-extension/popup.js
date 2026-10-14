const $=id=>document.getElementById(id);
let currentJob=null;
async function refresh(){
  const {job}=await chrome.storage.local.get('job');currentJob=job;
  $('status').textContent=job?.status||'Ready';$('message').textContent=job?.message||'Open Gas Safe, search your city, then start here.';
  $('start').disabled=job?.status==='running';$('stop').disabled=job?.status!=='running';
  $('resume').disabled=!job?.nextURL||!['paused','stopped'].includes(job?.status);
  $('json').disabled=$('csv').disabled=!Object.keys(job?.businesses||{}).length;
}
$('form').onsubmit=async event=>{
  event.preventDefault();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    GasSafeParser.safeURL(tab.url);
    const response=await chrome.tabs.sendMessage(tab.id,{type:'preview'});
    if(response?.error)throw Error(response.error);
    if(response?.page?.kind!=='businesses')throw Error('Start from a business search results page, not an engineer/details page.');
    const location=$('location').value.trim()||response.page.location;
    if(!location)throw Error('Enter the city or postcode used for this search.');
    const maxPages=Number($('pages').value),engineerPages=Number($('engineerPages').value);
    if(!Number.isInteger(maxPages)||!Number.isInteger(engineerPages)||maxPages<1||maxPages>50||engineerPages<1||engineerPages>50)throw Error('Page limits must be whole numbers from 1 to 50.');
    const job={id:crypto.randomUUID(),tabId:tab.id,status:'running',phase:'businesses',location,sourceLocation:response.page.location,serviceType:$('service').value,maxPages,engineerPages,includeEngineers:$('engineers').checked,pagesDone:0,totalResults:null,businesses:{},visited:[],tasks:[],message:'Reading current results…',updatedAt:new Date().toISOString()};
    const saved=await chrome.runtime.sendMessage({type:'start',job});if(saved.error)throw Error(saved.error);
    await chrome.tabs.sendMessage(tab.id,{type:'collect'});await refresh();
  }catch(error){$('message').textContent=(error.message.includes('Receiving end')?'Refresh your Gas Safe tab after installing the extension, then try again.':error.message);}
};
$('stop').onclick=async()=>{await chrome.runtime.sendMessage({type:'stop'});await refresh();};
$('resume').onclick=async()=>{
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});GasSafeParser.safeURL(tab.url);const response=await chrome.runtime.sendMessage({type:'resume',tabId:tab.id});if(response.error)throw Error(response.error);await chrome.tabs.update(tab.id,{url:GasSafeParser.safeURL(response.nextURL)});await refresh();}
  catch(error){$('message').textContent=error.message;}
};
function download(kind){
  if(!currentJob)return;
  const content=kind==='json'?JSON.stringify(GasSafeParser.output(currentJob),null,2):GasSafeParser.csv(currentJob);
  const url=URL.createObjectURL(new Blob([content],{type:kind==='json'?'application/json':'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='gas-safe-'+currentJob.location.replace(/[^a-z0-9_-]/gi,'-')+'.'+kind;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('json').onclick=()=>download('json');$('csv').onclick=()=>download('csv');
chrome.storage.onChanged.addListener(refresh);refresh();
