// ── Market identity and session definitions ──────────────────────────────────
(function(root){
  var MarketBrief=root.MarketBrief=root.MarketBrief||{};

  var markets={
    US:{
      timezone:'America/New_York',
      open:'09:30',
      close:'16:00',
      sessions:[
        {name:'preMarket',start:'04:00',end:'09:30',regularOpen:false,quoteExpectedToMove:true},
        {name:'regular',start:'09:30',end:'16:00',regularOpen:true,quoteExpectedToMove:true},
        {name:'postMarket',start:'16:00',end:'20:00',regularOpen:false,quoteExpectedToMove:true}
      ],
      symbolSuffixes:[],
      indexSymbols:[]
    },
    SG:{
      timezone:'Asia/Singapore',
      open:'09:00',
      close:'17:00',
      sessions:[
        {name:'regularMorning',start:'09:00',end:'12:00',regularOpen:true,quoteExpectedToMove:true},
        {name:'lunchBreak',start:'12:00',end:'13:00',regularOpen:false,quoteExpectedToMove:false},
        {name:'regularAfternoon',start:'13:00',end:'17:00',regularOpen:true,quoteExpectedToMove:true}
      ],
      pollingGrace:{lunchBreak:{fastUntilMinutes:30,slowUntilMinutes:60},close:{fastUntilMinutes:30,slowUntilMinutes:45}},
      symbolSuffixes:['.SI'],
      indexSymbols:['^STI']
    },
    HK:{
      timezone:'Asia/Hong_Kong',
      open:'09:30',
      close:'16:00',
      sessions:[
        {name:'regularMorning',start:'09:30',end:'12:00',regularOpen:true,quoteExpectedToMove:true},
        {name:'lunchBreak',start:'12:00',end:'13:00',regularOpen:false,quoteExpectedToMove:false},
        {name:'regularAfternoon',start:'13:00',end:'16:00',regularOpen:true,quoteExpectedToMove:true}
      ],
      pollingGrace:{lunchBreak:{fastUntilMinutes:15,slowUntilMinutes:15},close:{fastUntilMinutes:30,slowUntilMinutes:45}},
      symbolSuffixes:['.HK'],
      indexSymbols:['^HSI']
    }
  };

  var marketCalendars={
    US:{
      source:{name:'NYSE',type:'official-exchange',url:'https://www.nyse.com/trade/hours-calendars'},
      years:{
        2026:{sourceKey:'source',verification:'exchange-verified',exchangeVerification:'verified',holidays:{
        '2026-01-01':{name:"New Year's Day",status:'closed'},
        '2026-01-19':{name:'Martin Luther King, Jr. Day',status:'closed'},
        '2026-02-16':{name:"Washington's Birthday",status:'closed'},
        '2026-04-03':{name:'Good Friday',status:'closed'},
        '2026-05-25':{name:'Memorial Day',status:'closed'},
        '2026-06-19':{name:'Juneteenth National Independence Day',status:'closed'},
        '2026-07-03':{name:'Independence Day observed',status:'closed'},
        '2026-09-07':{name:'Labor Day',status:'closed'},
        '2026-11-26':{name:'Thanksgiving Day',status:'closed'},
        '2026-12-25':{name:'Christmas Day',status:'closed'}
        }},
        2027:{sourceKey:'source',verification:'exchange-verified',exchangeVerification:'verified',holidays:{
        '2027-01-01':{name:"New Year's Day",status:'closed'},
        '2027-01-18':{name:'Martin Luther King, Jr. Day',status:'closed'},
        '2027-02-15':{name:"Washington's Birthday",status:'closed'},
        '2027-03-26':{name:'Good Friday',status:'closed'},
        '2027-05-31':{name:'Memorial Day',status:'closed'},
        '2027-06-18':{name:'Juneteenth National Independence Day observed',status:'closed'},
        '2027-07-05':{name:'Independence Day observed',status:'closed'},
        '2027-09-06':{name:'Labor Day',status:'closed'},
        '2027-11-25':{name:'Thanksgiving Day',status:'closed'},
        '2027-12-24':{name:'Christmas Day observed',status:'closed'}
        }}
      }
    },
    SG:{
      source:{name:'TradingHours.com XSES',type:'exchange-calendar-reference',url:'https://www.tradinghours.com/markets/sgx'},
      crossCheckSource:{name:'Singapore Ministry of Manpower',type:'government',url:'https://www.mom.gov.sg/employment-practices/public-holidays'},
      years:{
        2026:{sourceKey:'source',verification:'exchange-verified',exchangeVerification:'verified',holidays:{
        '2026-01-01':{name:"New Year's Day",status:'closed'},
        '2026-02-17':{name:'Chinese New Year',status:'closed'},
        '2026-02-18':{name:'Chinese New Year',status:'closed'},
        '2026-04-03':{name:'Good Friday',status:'closed'},
        '2026-05-01':{name:'Labour Day',status:'closed'},
        '2026-05-27':{name:'Hari Raya Haji',status:'closed'},
        '2026-06-01':{name:'Vesak Day observed',status:'closed'},
        '2026-08-10':{name:'National Day observed',status:'closed'},
        '2026-11-09':{name:'Deepavali observed',status:'closed'},
        '2026-12-25':{name:'Christmas Day',status:'closed'}
        }},
        2027:{sourceKey:'crossCheckSource',verification:'government-published',exchangeVerification:'pending',holidays:{
        '2027-01-01':{name:"New Year's Day",status:'closed'},
        '2027-02-08':{name:'Chinese New Year observed',status:'closed'},
        '2027-03-10':{name:'Hari Raya Puasa',status:'closed'},
        '2027-03-26':{name:'Good Friday',status:'closed'},
        '2027-05-17':{name:'Hari Raya Haji',status:'closed'},
        '2027-05-20':{name:'Vesak Day',status:'closed'},
        '2027-08-09':{name:'National Day',status:'closed'},
        '2027-10-28':{name:'Deepavali',status:'closed'}
        }}
      }
    },
    HK:{
      source:{name:'HKEX',type:'official-exchange',url:'https://www.hkex.com.hk/News/HKEX-Calendar?sc_lang=en'},
      years:{
        2026:{sourceKey:'source',verification:'exchange-verified',exchangeVerification:'verified',holidays:{
        '2026-01-01':{name:'The first day of January',status:'closed'},
        '2026-02-17':{name:"Lunar New Year's Day",status:'closed'},
        '2026-02-18':{name:'The second day of Lunar New Year',status:'closed'},
        '2026-02-19':{name:'The third day of Lunar New Year',status:'closed'},
        '2026-04-03':{name:'Good Friday',status:'closed'},
        '2026-04-06':{name:'The day following Ching Ming Festival',status:'closed'},
        '2026-04-07':{name:'The day following Easter Monday',status:'closed'},
        '2026-05-01':{name:'Labour Day',status:'closed'},
        '2026-05-25':{name:'The day following the Birthday of the Buddha',status:'closed'},
        '2026-06-19':{name:'Tuen Ng Festival',status:'closed'},
        '2026-07-01':{name:'Hong Kong Special Administrative Region Establishment Day',status:'closed'},
        '2026-10-01':{name:'National Day',status:'closed'},
        '2026-10-19':{name:'The day following Chung Yeung Festival',status:'closed'},
        '2026-12-25':{name:'Christmas Day',status:'closed'}
        }},
        2027:{sourceKey:'source',verification:'exchange-verified',exchangeVerification:'verified',holidays:{
        '2027-01-01':{name:'The first day of January',status:'closed'},
        '2027-02-08':{name:'The third day of Lunar New Year',status:'closed'},
        '2027-02-09':{name:'The fourth day of Lunar New Year',status:'closed'},
        '2027-03-26':{name:'Good Friday',status:'closed'},
        '2027-03-29':{name:'Easter Monday',status:'closed'},
        '2027-04-05':{name:'Ching Ming Festival',status:'closed'},
        '2027-06-09':{name:'Tuen Ng Festival',status:'closed'},
        '2027-07-01':{name:'Hong Kong Special Administrative Region Establishment Day',status:'closed'},
        '2027-09-16':{name:'The day following the Chinese Mid-Autumn Festival',status:'closed'},
        '2027-10-01':{name:'National Day',status:'closed'},
        '2027-10-08':{name:'Chung Yeung Festival',status:'closed'},
        '2027-12-27':{name:'The first weekday after Christmas Day',status:'closed'}
        }}
      }
    }
  };

  function getCalendarCoverage(calendar){
    var years=Object.keys(calendar.years).map(Number).sort(function(a,b){return a-b;});
    var earliestYear=years[0];
    var latestYear=years[years.length-1];
    return {
      coverageStart:earliestYear+'-01-01',
      coverageThrough:latestYear+'-12-31',
      coverageLabel:earliestYear===latestYear?String(earliestYear):earliestYear+'-'+latestYear,
      earliestYear:earliestYear,
      latestYear:latestYear
    };
  }

  function getCalendarDateState(market,exchangeDate){
    var calendar=marketCalendars[market];
    var coverage=getCalendarCoverage(calendar);
    var yearData=calendar.years[parseInt(exchangeDate.slice(0,4))]||null;
    return {
      calendar:calendar,
      coverage:coverage,
      covered:!!yearData,
      yearData:yearData,
      holiday:yearData&&yearData.holidays[exchangeDate]&&yearData.holidays[exchangeDate].status==='closed'?yearData.holidays[exchangeDate]:null
    };
  }

  function calendarDayNumber(date){
    var parts=date.split('-').map(Number);
    return Math.floor(Date.UTC(parts[0],parts[1]-1,parts[2])/86400000);
  }

  function getMarketCodeForSymbol(symbol){
    var normalized=String(symbol||'').toUpperCase();
    if(markets.SG.symbolSuffixes.some(function(suffix){return normalized.endsWith(suffix);})||markets.SG.indexSymbols.indexOf(normalized)!==-1) return 'SG';
    if(markets.HK.symbolSuffixes.some(function(suffix){return normalized.endsWith(suffix);})||markets.HK.indexSymbols.indexOf(normalized)!==-1) return 'HK';
    return 'US';
  }

  function minutesFromTime(value){
    var parts=value.split(':');
    return parseInt(parts[0])*60+parseInt(parts[1]);
  }

  function exchangeDateTime(instant,timezone){
    var parts=new Intl.DateTimeFormat('en-US',{
      timeZone:timezone,
      year:'numeric',month:'2-digit',day:'2-digit',
      weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(instant);
    var values={};
    parts.forEach(function(part){values[part.type]=part.value;});
    return {
      date:values.year+'-'+values.month+'-'+values.day,
      time:values.hour+':'+values.minute,
      weekday:values.weekday,
      minuteOfDay:parseInt(values.hour)*60+parseInt(values.minute)
    };
  }

  function getSessionState(symbolOrMarket,now){
    var normalized=String(symbolOrMarket||'').toUpperCase();
    var market=markets[normalized]?normalized:getMarketCodeForSymbol(normalized);
    var definition=markets[market];
    var instant=now===undefined?new Date():new Date(now);
    if(!Number.isFinite(instant.getTime()))throw new Error('Invalid session timestamp');
    var local=exchangeDateTime(instant,definition.timezone);
    var calendarState=getCalendarDateState(market,local.date);
    var weekend=local.weekday==='Saturday'||local.weekday==='Sunday';
    var holiday=calendarState.covered&&!weekend?calendarState.holiday:null;
    var tradingDay=!weekend&&!holiday;
    var session='closed';
    var regularOpen=false;
    var quoteExpectedToMove=false;
    var holidayName=null;
    if(holiday){
      session='holiday';
      holidayName=holiday.name;
    }
    if(tradingDay){
      var active=definition.sessions.find(function(window){
        return local.minuteOfDay>=minutesFromTime(window.start)&&local.minuteOfDay<minutesFromTime(window.end);
      });
      if(active){
        session=active.name;
        regularOpen=active.regularOpen;
        quoteExpectedToMove=active.quoteExpectedToMove;
      }
    }
    return {
      market:market,
      timezone:definition.timezone,
      exchangeDate:local.date,
      exchangeTime:local.time,
      exchangeWeekday:local.weekday,
      tradingDay:tradingDay,
      session:session,
      regularOpen:regularOpen,
      quoteExpectedToMove:quoteExpectedToMove,
      calendarCoverage:calendarState.covered?calendarState.coverage.coverageLabel:'weekend-only',
      holidayName:holidayName
    };
  }

  function shiftExchangeDate(exchangeDate,days){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(exchangeDate);
    if(!match)throw new Error('Invalid exchange date');
    var year=parseInt(match[1]),month=parseInt(match[2]),day=parseInt(match[3]);
    var instant=new Date(Date.UTC(year,month-1,day));
    if(instant.getUTCFullYear()!==year||instant.getUTCMonth()!==month-1||instant.getUTCDate()!==day)throw new Error('Invalid exchange date');
    instant.setUTCDate(instant.getUTCDate()+days);
    return instant.getUTCFullYear()+'-'+String(instant.getUTCMonth()+1).padStart(2,'0')+'-'+String(instant.getUTCDate()).padStart(2,'0');
  }

  function isTradingDate(market,exchangeDate){
    var weekday=new Date(exchangeDate+'T00:00:00Z').getUTCDay();
    if(weekday===0||weekday===6)return false;
    return !getCalendarDateState(market,exchangeDate).holiday;
  }

  function getPreviousTradingDate(marketOrSymbol,exchangeDate){
    var normalized=String(marketOrSymbol||'').toUpperCase();
    var market=markets[normalized]?normalized:getMarketCodeForSymbol(normalized);
    var candidate=shiftExchangeDate(exchangeDate,-1);
    while(!isTradingDate(market,candidate))candidate=shiftExchangeDate(candidate,-1);
    return candidate;
  }

  function getLatestCompletedRegularSessionDate(marketOrSymbol,now){
    var state=getSessionState(marketOrSymbol,now);
    if(state.tradingDay&&minutesFromTime(state.exchangeTime)>=minutesFromTime(markets[state.market].close))return state.exchangeDate;
    return getPreviousTradingDate(state.market,state.exchangeDate);
  }

  function getQuotePollingGraceCadence(symbolOrMarket,now){
    var state=getSessionState(symbolOrMarket,now);
    if((state.market!=='SG'&&state.market!=='HK')||!state.tradingDay)return 0;
    var graceStart=null;
    var gracePolicy=null;
    if(state.session==='lunchBreak'){
      var lunchWindow=markets[state.market].sessions.find(function(window){return window.name==='lunchBreak';});
      graceStart=lunchWindow?lunchWindow.start:null;
      gracePolicy=markets[state.market].pollingGrace.lunchBreak;
    } else if(state.session==='closed'){
      graceStart=markets[state.market].close;
      gracePolicy=markets[state.market].pollingGrace.close;
    }
    if(graceStart===null||gracePolicy===null)return 0;
    var minutesAfterSegment=minutesFromTime(state.exchangeTime)-minutesFromTime(graceStart);
    if(minutesAfterSegment>=0&&minutesAfterSegment<gracePolicy.fastUntilMinutes)return 5;
    if(minutesAfterSegment>=gracePolicy.fastUntilMinutes&&minutesAfterSegment<gracePolicy.slowUntilMinutes)return 60;
    return 0;
  }

  function shouldPollQuoteDuringGrace(symbolOrMarket,now){
    return getQuotePollingGraceCadence(symbolOrMarket,now)>0;
  }

  function shouldPollSearchQuote(symbolOrMarket,now){
    var state=getSessionState(symbolOrMarket,now);
    return state.quoteExpectedToMove||shouldPollQuoteDuringGrace(symbolOrMarket,now);
  }

  function getCalendarStatus(marketOrSymbol,now){
    var normalized=String(marketOrSymbol||'').toUpperCase();
    var market=markets[normalized]?normalized:getMarketCodeForSymbol(normalized);
    var definition=markets[market];
    var instant=now===undefined?new Date():new Date(now);
    if(!Number.isFinite(instant.getTime()))throw new Error('Invalid calendar timestamp');
    var local=exchangeDateTime(instant,definition.timezone);
    var calendarState=getCalendarDateState(market,local.date);
    var calendar=calendarState.calendar;
    var coverage=calendarState.coverage;
    var calendarYears=Object.keys(calendar.years).map(Number).sort(function(a,b){return a-b;});
    var yearStatuses=calendarYears.map(function(year){
      var yearData=calendar.years[year];
      var yearSource=calendar[yearData.sourceKey]||calendar.source;
      return {year:year,verification:yearData.verification,exchangeVerification:yearData.exchangeVerification,sourceName:yearSource.name,sourceType:yearSource.type,sourceUrl:yearSource.url};
    });
    var yearSource=calendarState.yearData?(calendar[calendarState.yearData.sourceKey]||calendar.source):null;
    var daysUntilExpiry=calendarDayNumber(coverage.coverageThrough)-calendarDayNumber(local.date);
    var expiryStatus=daysUntilExpiry>90?'current':daysUntilExpiry>=31?'expiring':daysUntilExpiry>=0?'urgent':'expired';
    return {
      market:market,
      exchangeDate:local.date,
      coverageStart:coverage.coverageStart,
      coverageThrough:coverage.coverageThrough,
      coverageLabel:coverage.coverageLabel,
      latestYear:coverage.latestYear,
      covered:calendarState.covered,
      daysUntilExpiry:daysUntilExpiry,
      expiryStatus:expiryStatus,
      verification:calendarState.yearData?calendarState.yearData.verification:null,
      exchangeVerification:calendarState.yearData?calendarState.yearData.exchangeVerification:null,
      yearSourceName:yearSource?yearSource.name:null,
      yearSourceUrl:yearSource?yearSource.url:null,
      yearSourceType:yearSource?yearSource.type:null,
      yearStatuses:yearStatuses,
      pendingExchangeVerificationYears:yearStatuses.filter(function(year){return year.exchangeVerification==='pending';}).map(function(year){return year.year;}),
      sourceName:calendar.source.name,
      sourceUrl:calendar.source.url,
      sourceType:calendar.source.type,
      crossCheckSourceName:calendar.crossCheckSource?calendar.crossCheckSource.name:null,
      crossCheckSourceUrl:calendar.crossCheckSource?calendar.crossCheckSource.url:null,
      crossCheckSourceType:calendar.crossCheckSource?calendar.crossCheckSource.type:null
    };
  }

  function finiteNumber(value){
    return Number.isFinite(value)?value:null;
  }

  function exchangeDateKey(timestamp,timezone){
    if(!Number.isFinite(timestamp)||typeof timezone!=='string'||!timezone)return null;
    try{
      var parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp*1000));
      var values={};
      parts.forEach(function(part){values[part.type]=part.value;});
      return values.year&&values.month&&values.day?values.year+'-'+values.month+'-'+values.day:null;
    }catch(e){return null;}
  }

  function normalizeQuote(raw,requestedSymbol){
    raw=raw&&typeof raw==='object'?raw:{};
    var provider=raw.provider&&typeof raw.provider==='object'?raw.provider:{};
    var symbol=String(requestedSymbol||raw.symbol||'').toUpperCase();
    var market=getMarketCodeForSymbol(symbol);
    var providerMarketState=typeof provider.marketState==='string'?provider.marketState.toUpperCase():null;
    var regularMarketPrice=finiteNumber(provider.regularMarketPrice);
    var previousClose=finiteNumber(provider.regularMarketPreviousClose);
    var preMarketPrice=finiteNumber(provider.preMarketPrice);
    var preMarketTime=finiteNumber(provider.preMarketTime);
    var postMarketPrice=finiteNumber(provider.postMarketPrice);
    var latestDailyClose=finiteNumber(provider.latestDailyClose);
    var previousDailyClose=finiteNumber(provider.previousDailyClose);
    var immediatePreviousClose=finiteNumber(provider.immediatePreviousClose);
    var immediatePreviousCloseTime=finiteNumber(provider.immediatePreviousCloseTime);
    var regularMarketTime=finiteNumber(provider.regularMarketTime);
    var latestDailyCloseTime=finiteNumber(provider.latestDailyCloseTime);
    var previousDailyCloseTime=finiteNumber(provider.previousDailyCloseTime);
    var hasDailyClosePair=latestDailyClose!==null&&previousDailyClose!==null;
    var useDailyClosePair=hasDailyClosePair&&(
      providerMarketState==='CLOSED'||
      ((providerMarketState!=='REGULAR'&&providerMarketState!=='PRE'&&providerMarketState!=='POST')&&raw.priceSource==='latestDailyClose')
    );
    var providerTimezone=typeof provider.exchangeTimezoneName==='string'?provider.exchangeTimezoneName:null;
    var marketTimezone=markets[market]&&markets[market].timezone;
    var regularMarketDate=exchangeDateKey(regularMarketTime,providerTimezone);
    var preMarketDate=exchangeDateKey(preMarketTime,providerTimezone);
    var latestDailyCloseDate=exchangeDateKey(latestDailyCloseTime,providerTimezone);
    var previousDailyCloseDate=exchangeDateKey(previousDailyCloseTime,providerTimezone);
    var immediatePreviousCloseDate=exchangeDateKey(immediatePreviousCloseTime,providerTimezone);
    if((regularMarketDate===null||preMarketDate===null||latestDailyCloseDate===null||previousDailyCloseDate===null||immediatePreviousCloseDate===null)&&providerTimezone!==marketTimezone){
      regularMarketDate=exchangeDateKey(regularMarketTime,marketTimezone);
      preMarketDate=exchangeDateKey(preMarketTime,marketTimezone);
      latestDailyCloseDate=exchangeDateKey(latestDailyCloseTime,marketTimezone);
      previousDailyCloseDate=exchangeDateKey(previousDailyCloseTime,marketTimezone);
      immediatePreviousCloseDate=exchangeDateKey(immediatePreviousCloseTime,marketTimezone);
    }
    var currentExchangeTradingDate=providerMarketState==='PRE'&&market==='US'&&preMarketDate!==null?preMarketDate:regularMarketDate;
    var useNewerRegularClose=useDailyClosePair&&providerMarketState!=='CLOSED'&&regularMarketPrice!==null&&regularMarketDate!==null&&latestDailyCloseDate!==null&&regularMarketDate>latestDailyCloseDate;
    var expectedPreviousTradingDate=null;
    if(currentExchangeTradingDate!==null){
      try{expectedPreviousTradingDate=getPreviousTradingDate(market,currentExchangeTradingDate);}catch(e){}
    }
    var hasVerifiedImmediatePreviousClose=immediatePreviousClose!==null&&immediatePreviousClose>0&&immediatePreviousCloseDate!==null&&immediatePreviousCloseDate===expectedPreviousTradingDate;
    var dailyReferenceClose=null;
    var dailyReferenceResolved=false;
    if(expectedPreviousTradingDate!==null&&latestDailyCloseDate!==null){
      if(latestDailyCloseDate===currentExchangeTradingDate){
        if(previousDailyCloseDate!==null){
          dailyReferenceResolved=true;
          if(previousDailyClose!==null&&previousDailyClose>0&&previousDailyCloseDate===expectedPreviousTradingDate)dailyReferenceClose=previousDailyClose;
        }
      } else if(latestDailyCloseDate===expectedPreviousTradingDate){
        dailyReferenceResolved=true;
        if(latestDailyClose!==null&&latestDailyClose>0)dailyReferenceClose=latestDailyClose;
      } else if(latestDailyCloseDate<expectedPreviousTradingDate){
        dailyReferenceResolved=true;
        if(hasVerifiedImmediatePreviousClose)dailyReferenceClose=immediatePreviousClose;
      } else dailyReferenceResolved=true;
    }
    var completedDailyReferenceClose=dailyReferenceResolved?dailyReferenceClose:(hasVerifiedImmediatePreviousClose?immediatePreviousClose:(provider.dailyClosePairHasGap===true?null:previousDailyClose));
    var regularReferenceClose=previousClose!==null?previousClose:(dailyReferenceResolved?dailyReferenceClose:(hasVerifiedImmediatePreviousClose?immediatePreviousClose:null));
    var displayPrice=null;
    var displayPriceSession=null;
    var referencePrice=null;
    var providerTimestamp=null;
    var providerTimestampSource=null;
    var status='invalid';

    if(providerMarketState==='REGULAR'&&regularMarketPrice!==null){
      displayPrice=regularMarketPrice;
      displayPriceSession='regular';
      referencePrice=regularReferenceClose;
      previousClose=referencePrice;
      providerTimestamp=finiteNumber(provider.regularMarketTime);
      providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
      status='ok';
    } else if(providerMarketState==='PRE'){
      if(market==='US'&&preMarketPrice!==null){
        displayPrice=preMarketPrice;
        displayPriceSession='pre';
        referencePrice=regularReferenceClose;
        previousClose=referencePrice;
        providerTimestamp=preMarketTime;
        providerTimestampSource=providerTimestamp===null?null:'preMarketTime';
        status='ok';
      } else if(regularMarketPrice!==null){
        displayPrice=regularMarketPrice;
        displayPriceSession='regularClose';
        referencePrice=previousClose;
        providerTimestamp=finiteNumber(provider.regularMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
        status='ok';
      }
    } else if(providerMarketState==='POST'){
      if(market==='US'&&postMarketPrice!==null){
        displayPrice=postMarketPrice;
        displayPriceSession='post';
        referencePrice=regularMarketPrice;
        providerTimestamp=finiteNumber(provider.postMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'postMarketTime';
        status='ok';
      } else if(regularMarketPrice!==null){
        displayPrice=regularMarketPrice;
        displayPriceSession='regularClose';
        referencePrice=previousClose;
        providerTimestamp=finiteNumber(provider.regularMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
        status='ok';
      }
    } else if(providerMarketState==='CLOSED'||useDailyClosePair){
      if(useDailyClosePair){
        displayPrice=useNewerRegularClose?regularMarketPrice:latestDailyClose;
        displayPriceSession='regularClose';
        referencePrice=completedDailyReferenceClose;
        previousClose=referencePrice;
        providerTimestamp=useNewerRegularClose?regularMarketTime:latestDailyCloseTime;
        providerTimestampSource=providerTimestamp===null?null:(useNewerRegularClose?'regularMarketTime':'latestDailyCloseTime');
        status='ok';
      } else if(regularMarketPrice!==null){
        displayPrice=regularMarketPrice;
        displayPriceSession='regularClose';
        referencePrice=previousClose;
        providerTimestamp=finiteNumber(provider.regularMarketTime);
        providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
        status='ok';
      }
    } else if(providerMarketState!=='REGULAR'&&regularMarketPrice!==null){
      displayPrice=regularMarketPrice;
      displayPriceSession='unknown';
      referencePrice=previousClose;
      providerTimestamp=finiteNumber(provider.regularMarketTime);
      providerTimestampSource=providerTimestamp===null?null:'regularMarketTime';
      status='ok';
    }

    if(displayPrice===null&&finiteNumber(raw.price)!==null){
      displayPrice=finiteNumber(raw.price);
      displayPriceSession='unknown';
      referencePrice=previousClose;
      if(raw.priceSource==='latestDailyClose'){
        providerTimestamp=finiteNumber(provider.latestChartTimestamp);
        providerTimestampSource=providerTimestamp===null?null:'latestChartTimestamp';
      }
      status='fallback';
    }

    var change=null;
    var percentChange=null;
    if(displayPrice!==null&&referencePrice!==null){
      change=displayPrice-referencePrice;
      percentChange=referencePrice!==0?change/referencePrice*100:null;
    }

    return {
      symbol:symbol,
      name:raw.name||symbol,
      market:market,
      exchange:provider.fullExchangeName||provider.exchangeName||provider.exchange||null,
      currency:raw.currency||null,
      quoteType:provider.quoteType||provider.instrumentType||null,
      regularMarketPrice:regularMarketPrice,
      previousClose:previousClose,
      displayPrice:displayPrice,
      displayPriceSession:displayPriceSession,
      referencePrice:referencePrice,
      change:change,
      percentChange:percentChange,
      providerMarketState:providerMarketState,
      providerTimestamp:providerTimestamp,
      providerTimestampSource:providerTimestampSource,
      receivedAt:new Date().toISOString(),
      freshness:'unknown',
      status:status,
      error:status==='invalid'?{code:'NO_DISPLAY_PRICE',message:'No finite quote price available'}:null
    };
  }

  MarketBrief.marketData={
    markets:markets,
    getMarketCodeForSymbol:getMarketCodeForSymbol,
    getSessionState:getSessionState,
    getPreviousTradingDate:getPreviousTradingDate,
    getLatestCompletedRegularSessionDate:getLatestCompletedRegularSessionDate,
    getQuotePollingGraceCadence:getQuotePollingGraceCadence,
    shouldPollQuoteDuringGrace:shouldPollQuoteDuringGrace,
    shouldPollSearchQuote:shouldPollSearchQuote,
    getCalendarStatus:getCalendarStatus,
    normalizeQuote:normalizeQuote
  };
})(window);
