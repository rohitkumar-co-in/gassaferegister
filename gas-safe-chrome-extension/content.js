(() => {
  let busy=false;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function save(job){job.updatedAt=new Date().toISOString();const response=await chrome.runtime.sendMessage({type:'progress',job});return response?.accepted;}
  async function run(){
    if(busy)return;busy=true;
    let job;
    try{
      ({job}=await chrome.storage.local.get('job'));
      const identity=await chrome.runtime.sendMessage({type:'tabIdentity'});
      if(!job||job.status!=='running'||identity.tabId!==job.tabId)return;
      let parsed;
      for(let attempt=0;attempt<12;attempt++){
        try{parsed=GasSafeParser.parse(document);break;}catch(error){
          if(/blocked access/.test(error.message)||attempt===11)throw error;
          await wait(500);
        }
      }
      if(job.phase==='businesses'){
        if(parsed.kind!=='businesses')throw Error('Search results expected. Do not navigate this tab while collecting.');
        if(job.sourceLocation && parsed.location && job.sourceLocation.toLowerCase()!==parsed.location.toLowerCase())throw Error('Search location changed. Stopped to avoid mixing cities.');
        const pageKey=location.pathname+'|'+parsed.page;
        if(job.visited.includes(pageKey))throw Error('Repeated results page detected. Stopped to avoid a pagination loop.');
        job.visited.push(pageKey);job.pagesDone++;job.totalResults=parsed.total_results;
        for(const item of parsed.businesses)if(!job.businesses[item.registration_number])job.businesses[item.registration_number]=item;
        if(parsed.next_page_url && job.pagesDone<job.maxPages)job.nextURL=parsed.next_page_url;
        else{
          job.phase='details';job.tasks=[];
          if(job.includeEngineers)for(const business of Object.values(job.businesses)){
            business.engineers_status=business.engineers_fetched?(business.engineers_complete?'completed':'partial'):'pending';business.services_status=business.qualifications?'completed':'pending';
            if(business.engineers_url)job.tasks.push({kind:'engineers',registration:business.registration_number,url:business.engineers_url,pageCount:1,visited:[]});
            if(business.services_url)job.tasks.push({kind:'services',registration:business.registration_number,url:business.services_url});
          }
          job.nextURL=job.tasks[0]?.url||null;
        }
      }else{
        const task=job.tasks[0];
        if(!task||task.kind!==parsed.kind)throw Error('Unexpected detail page. Collection stopped.');
        const business=job.businesses[task.registration];
        try{GasSafeParser.applyDetail(business,parsed,{expectedURL:task.url,actualURL:location.href});}
        catch(error){
          business.collection_errors=business.collection_errors||[];business.collection_errors.push({stage:task.kind,message:error.message});
          business[task.kind==='engineers'?'engineers_status':'services_status']='error';
          job.tasks.shift();job.nextURL=job.tasks[0]?.url||null;
          job.message=`Skipped one ${task.kind} page for ${business.business_name}: ${error.message}`;
          if(!job.nextURL)job.status='completed_with_errors';
          if(await save(job) && job.nextURL){await wait(2500);const {job:latest}=await chrome.storage.local.get('job');if(latest?.id===job.id && latest.status==='running')location.assign(GasSafeParser.safeURL(job.nextURL));}
          return;
        }
        if(task.kind==='engineers' && parsed.next_page_url && task.pageCount<job.engineerPages){
          if(task.visited.includes(parsed.page))throw Error('Repeated engineer page detected.');
          task.visited.push(parsed.page);task.pageCount++;task.url=parsed.next_page_url;
        }else job.tasks.shift();
        job.nextURL=job.tasks[0]?.url||null;
      }
      const failures=Object.values(job.businesses).filter(b=>b.collection_errors?.length).length;const enriched=Object.values(job.businesses).filter(b=>b.engineers_fetched).length;
      job.message=`${Object.keys(job.businesses).length} unique businesses; ${job.pagesDone} result pages. Engineers fetched for ${enriched}. ${job.tasks?.length||0} detail visits pending; ${failures} businesses with errors.`;
      if(!job.nextURL){job.status=failures?'completed_with_errors':'completed';job.message+=' Finished within your page limits.';}
      if(!await save(job))return;
      if(job.nextURL){
        await wait(2500);
        const {job:latest}=await chrome.storage.local.get('job');
        if(latest?.id===job.id && latest.status==='running')location.assign(GasSafeParser.safeURL(job.nextURL));
      }
    }catch(error){
      if(job){
        const task=job.phase==='details'?job.tasks?.[0]:null;
        if(task){const business=job.businesses[task.registration];business[task.kind==='engineers'?'engineers_status':'services_status']='interrupted';business.collection_errors=business.collection_errors||[];business.collection_errors.push({stage:task.kind,message:error.message});job.nextURL=task.url;}
        job.status='paused';job.message=(task?`${task.kind} for ${job.businesses[task.registration].business_name}: `:'')+error.message+' Export partial results or resume after checking the Gas Safe tab.';await save(job);
      }
    }finally{busy=false;}
  }
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message.type==='preview'){
      try{reply({page:GasSafeParser.parse(document)});}catch(error){reply({error:error.message});}
    }
    if(message.type==='collect'){run();reply({accepted:true});}
  });
  run();
})();
