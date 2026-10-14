/* Pure DOM extraction. No network requests, scripts from the page, or owner inference. */
(() => {
  const text = n => n?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const field = (root, key) => text(root.querySelector(`[data-testid="${key}"]`));
  const url = (root, key) => {
    const href = root.querySelector(`a[data-testid="${key}"]`)?.getAttribute('href');
    if (!href) return null;
    return safeURL(href);
  };
  function safeURL(value) {
    if(typeof value!=='string'||!value.trim())throw Error('Open a Gas Safe results tab first.');
    const u = new URL(value, 'https://www.gassaferegister.co.uk/');
    if (u.protocol !== 'https:' || !['www.gassaferegister.co.uk', 'gassaferegister.co.uk'].includes(u.hostname)) throw Error('Unexpected link outside Gas Safe. Stopped.');
    return u.href;
  }
  function paging(doc) {
    const summary = field(doc, 'closestDistanceForEngineerorBusiness') || field(doc, 'closestDistanceBusiness');
    const match = summary.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
    return {page: Number(field(doc, 'pgCurrent')) || 1, total_results: match ? Number(match[3]) : null, next_page_url: url(doc, 'pgNext')};
  }
  function contact(value) {const result=String(value||'').trim();return /^(?:[-–—.]|n\/?a|not available)$/i.test(result)?null:result||null;}
  function parse(doc) {
    const cards = [...doc.querySelectorAll('.buscard')];
    if (cards.length) {
      const businesses = cards.map(card => {
        const address = {};
        for (const [key, selector] of Object.entries({premise:'premise',street:'street',town:'town',county:'county',postcode:'postCde'})) address[key] = field(card, selector) || null;
        if(address.postcode)address.postcode=address.postcode.toUpperCase();
        address.full_address = Object.values(address).filter(Boolean).join(', ');
        const registration_number = field(card, 'registrationNumber');
        const business_name = field(card, 'businessName');
        if (!business_name || !/^\d{1,10}$/.test(registration_number)) throw Error('Business card structure changed. No guessed records were saved.');
        return {business_name, registration_number, telephone:contact(field(card,'telephone')), email:contact(field(card,'eMail')), address,
          out_of_hours_available:/out of hours available/i.test(field(card,'outHoursavailable')), distance_miles:field(card,'distanceMiles'),
          engineers:[], engineers_fetched:false, engineers_complete:false, engineers_url:url(card,'vEngineers'), services_url:url(card,'vServices')};
      });
      return {kind:'businesses', location:doc.querySelector('#MatchedLocation')?.value || doc.querySelector('#postCodeTownlabel')?.value || '', ...paging(doc), businesses};
    }
    const name = field(doc, 'tradingName') || text(doc.querySelector('h1.wrapOverflow'));
    const engineerCards = [...doc.querySelectorAll('.show-engineers')];
    if (engineerCards.length && name) {
      const engineers = engineerCards.map(card => {
        const heading = [...card.querySelectorAll('h3,h4')].find(n => text(n) === 'Status');
        let status = '';
        for (let n = heading?.nextSibling; n && !['H3','H4'].includes(n.nodeName); n = n.nextSibling) status += ' ' + text(n);
        const telephone = field(card,'telephone');
        return {name:field(card,'EngineerName'), services:[...card.querySelectorAll('[data-testid]')].filter(n => n.dataset.testid.includes('servicesProvided')).map(text), telephone:!telephone || telephone.toLowerCase()==='n/a' ? null : telephone, status:status.trim() || null};
      });
      return {kind:'engineers',business_name:name,telephone:contact(field(doc,'telephone')),email:contact(field(doc,'email')),...paging(doc),engineers};
    }
    const tables = [...doc.querySelectorAll('.ServiceTypeTable')];
    if (tables.length && name) {
      const qualifications=[];
      for (const table of tables) for (const row of table.querySelectorAll('tbody tr.SafeBlackBackground')) {
        const cells = [...row.children].filter(n=>n.nodeName==='TD');
        if(cells.length<4) continue;
        qualifications.push({name:text(cells[0]),service_type:table.id.replace('Table',''),natural_gas:!!cells[1].querySelector('.fa-check'),lpg:!!cells[2].querySelector('.fa-check'),building_regulations:!!cells[3].querySelector('.fa-check')});
      }
      return {kind:'services',business_name:name,telephone:contact(field(doc,'telephone')),email:contact(field(doc,'email')),qualifications};
    }
    if (/access denied|request unsuccessful|blocked by our security service|captcha/i.test(text(doc.body))) throw Error('Gas Safe blocked access or requires verification. Collection stopped; existing records are retained.');
    throw Error('No supported results on this page. Open a successful Gas Safe search first, or the session may have expired.');
  }
  function clean(value) {return String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function phone(value){let digits=String(contact(value)||'').replace(/\D/g,'');if(digits.startsWith('0044'))digits='0'+digits.slice(4);else if(digits.startsWith('44'))digits='0'+digits.slice(2);return digits;}
  function sameDetailURL(expected,actual){
    try{const a=new URL(safeURL(expected)),b=new URL(safeURL(actual));let left=a.searchParams.get('ep'),right=b.searchParams.get('ep');if(!left||!right)return false;for(let i=0;i<2;i++){try{left=decodeURIComponent(left);right=decodeURIComponent(right);}catch{break;}}return a.pathname.toLowerCase()===b.pathname.toLowerCase()&&left===right;}catch{return false;}
  }
  function matches(business, detail, proof={}) {return clean(business.business_name)===clean(detail.business_name) && ((!!phone(business.telephone)&&phone(business.telephone)===phone(detail.telephone))||sameDetailURL(proof.expectedURL,proof.actualURL));}
  function applyDetail(business, detail, proof={}) {
    if (!matches(business,detail,proof)) throw Error('Detail identity does not match the business name and phone or original business-specific link.');
    if(!contact(business.telephone)&&contact(detail.telephone))business.telephone=detail.telephone;
    if(!contact(business.email)&&contact(detail.email))business.email=detail.email;
    if (detail.kind==='engineers') {
      business.engineers=[...new Map([...(business.engineers||[]),...detail.engineers].map(e=>[e.name+'|'+e.telephone,e])).values()];
      business.engineers_fetched=true;business.engineers_total_reported=detail.total_results;
      business.engineers_complete=detail.total_results!==null && business.engineers.length===detail.total_results;
      business.engineers_status=business.engineers_complete?'completed':'partial';
    } else {business.qualifications=detail.qualifications;business.services_status='completed';}
  }
  function output(job) {
    const businesses=Object.values(job.businesses || {});
    return {status:job.status==='completed'?'success':'partial',data:{location:job.location,service_type:job.serviceType,source_kind:'chrome_gas_safe_public_pages',collected_at:job.updatedAt,pages_fetched:job.pagesDone,total_results:job.totalResults,has_more:job.totalResults==null||businesses.length<job.totalResults,businesses},collection:{status:job.status,message:job.message,engineer_page_limit:job.engineerPages,live_registration_check:false}};
  }
  function csv(job) {
    const columns=['business_name','registration_number','telephone','email','address','postcode','out_of_hours_available','engineer_names','engineers_total_reported','engineers_complete','qualifications','engineers_status','services_status','collection_errors','collection_status'];
    const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    return '\ufeff'+[columns.map(cell).join(','),...Object.values(job.businesses||{}).map(b=>[b.business_name,b.registration_number,b.telephone,b.email,b.address?.full_address,b.address?.postcode,b.out_of_hours_available,(b.engineers||[]).map(e=>e.name).join('; '),b.engineers_total_reported,b.engineers_fetched?b.engineers_complete:'',(b.qualifications||[]).map(q=>q.name).join('; '),b.engineers_status||(b.engineers_fetched?'partial':'not_fetched'),b.services_status||(b.qualifications?'completed':'not_fetched'),(b.collection_errors||[]).map(e=>e.stage+': '+e.message).join('; '),job.status].map(cell).join(','))].join('\r\n');
  }
  globalThis.GasSafeParser={parse,safeURL,matches,applyDetail,sameDetailURL,output,csv};
})();
