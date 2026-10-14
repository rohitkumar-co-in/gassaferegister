// Serialize mutations so stopping a run cannot be overwritten by a late page callback.
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='tabIdentity'){reply({tabId:sender.tab?.id});return;}
  if(!['start','stop','progress','resume'].includes(message.type))return;
  queue=queue.catch(()=>{}).then(async()=>{
    const {job}=await chrome.storage.local.get('job');
    if(message.type==='progress'){
      if(!job||job.status!=='running'||job.id!==message.job.id||job.tabId!==sender.tab?.id)return {accepted:false};
      await chrome.storage.local.set({job:message.job});return {accepted:true};
    }
    if(sender.tab || !sender.url?.startsWith(chrome.runtime.getURL('')))throw Error('Invalid extension request.');
    if(message.type==='resume'){
      if(!job||job.status==='running'||!job.nextURL)throw Error('No paused navigation is available to resume.');
      job.status='running';job.tabId=message.tabId;job.message='Resuming pending collection…';job.updatedAt=new Date().toISOString();await chrome.storage.local.set({job});return {accepted:true,nextURL:job.nextURL};
    }
    if(message.type==='start'){
      if(job?.status==='running')throw Error('Stop the current run first.');
      await chrome.storage.local.set({job:message.job});return {accepted:true};
    }
    if(job){job.status='stopped';job.message='Stopped by you. Collected records are retained.';job.updatedAt=new Date().toISOString();await chrome.storage.local.set({job});}
    return {accepted:true};
  });
  queue.then(reply,error=>reply({error:error.message}));return true;
});
