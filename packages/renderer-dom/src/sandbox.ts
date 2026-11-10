/**
 * The frame of an isolated Custom HTML element (D05, D23.1, D23.2, D78). The
 * document's `html` goes into `srcdoc` only, behind a shell whose Content
 * Security Policy precedes every byte of author content and whose managed
 * clock runs before it; it is never parsed in the host document.
 */
import type { CustomHtmlNode } from '@kadrion/schema';

import type { AssetUrls } from './assets.js';
import { cssPixels } from './css.js';
import { RenderError } from './errors.js';

/** The only sandbox token: scripts run, but the origin stays opaque (no `allow-same-origin`). */
export const SANDBOX_TOKENS = 'allow-scripts';

/**
 * No network, no plugins, no base URL, no forms; inline script and style, and
 * fonts as `data:` URLs from verified bytes only (D23.2, D78).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** The name of the `meta` element that tells an element its instance ID (D23.3). */
export const INSTANCE_META = 'kadrion-instance';

/**
 * The fixed start of every element's document: the policy, then the instance
 * (D23.2). The instance ID is the node's ID, which the schema restricts to
 * `[A-Za-z0-9_-]`, so it needs no escaping. It is no secret: the window a
 * message comes from, not this ID, authenticates it (D23.3).
 */
export function sandboxShell(nodeId: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><meta name="${INSTANCE_META}" content="${nodeId}">`;
}

/** A `data:` URL of base64 bytes: nothing in it can end a CSS string or a style element. */
const FONT_URL = /^data:[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/;

/** JSON that may stand in a script element: `<` never appears as itself (D78). */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/**
 * The managed clock of D78, run before any byte of the author's: the time the
 * host pushes (D23.3), less the node's start and never below 0, is the time of
 * every clock the element can read, so that its animations begin when it
 * appears. On a valid `kadrion:time`, before any listener of the element, it
 * sets the clock and restarts the random source from the node's seed and that
 * time; after the
 * listeners of the element, it runs the callbacks of `requestAnimationFrame`
 * once with that time, sets the current time of every animation of
 * `document.getAnimations()` to it, and answers once the element's fonts are
 * loaded, unless the element listens to messages itself and so answers for
 * itself (D23.3). It keeps no frame history that the picture depends on.
 */
function managedClock(
  instanceId: string,
  startUs: number,
  parameters: string,
  fonts: string,
): string {
  return [
    '(function(){"use strict";',
    `var INSTANCE="${instanceId}",START=${String(startUs)},PARAMETERS=${parameters},FONTS=${fonts};`,
    "var KEYS='instanceId,requestId,timeUs,type,version',win=window,doc=document,RealDate=Date;",
    'var listen=EventTarget.prototype.addEventListener;',
    'var clock={timeUs:0,seed:0,state:0,frames:[],next:1,answers:true,held:[],saved:new Map()};',
    'function hash(text,h){for(var i=0;i<text.length;i+=1){h=Math.imul(h^text.charCodeAt(i),16777619)>>>0}return h}',
    'clock.seed=hash(INSTANCE,2166136261);clock.state=clock.seed;',
    'function now(){return clock.timeUs/1000}',
    'function random(){clock.state=(clock.state+1831565813)>>>0;var t=clock.state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}',
    'function ManagedDate(){var args=Array.prototype.slice.call(arguments);if(!new.target)return new RealDate(Math.floor(now())).toString();return Reflect.construct(RealDate,args.length===0?[Math.floor(now())]:args,new.target)}',
    'ManagedDate.prototype=RealDate.prototype;ManagedDate.now=function(){return Math.floor(now())};ManagedDate.parse=RealDate.parse;ManagedDate.UTC=RealDate.UTC;',
    "Object.defineProperty(win,'Date',{value:ManagedDate,writable:true,configurable:true});",
    'Math.random=random;',
    "if(typeof performance==='object'&&performance!==null)Object.defineProperty(performance,'now',{value:function(){return now()},writable:true,configurable:true});",
    'win.requestAnimationFrame=function(callback){var id=clock.next;clock.next+=1;clock.frames.push({id:id,callback:callback});return id};',
    'win.cancelAnimationFrame=function(id){clock.frames=clock.frames.filter(function(frame){return frame.id!==id})};',
    "win.addEventListener=function(type){if(type==='message')clock.answers=false;return listen.apply(this,arguments)};",
    "var handler=Object.getOwnPropertyDescriptor(win,'onmessage');",
    "if(handler&&handler.set&&handler.configurable)Object.defineProperty(win,'onmessage',{configurable:true,enumerable:handler.enumerable,get:handler.get,set:function(value){clock.answers=false;handler.set.call(this,value)}});",
    "Object.defineProperty(win,'kadrion',{value:Object.freeze({instanceId:INSTANCE,parameters:Object.freeze(PARAMETERS),get timeUs(){return clock.timeUs}})});",
    "function cssName(key){return key.indexOf('--')===0?key:key==='cssFloat'?'float':key.replace(/[A-Z]/g,function(c){return'-'+c.toLowerCase()})}",
    "function restore(){clock.saved.forEach(function(saved,element){Object.keys(saved).forEach(function(name){var value=saved[name];if(value[0]==='')element.style.removeProperty(name);else element.style.setProperty(name,value[0],value[1])})});clock.saved.clear()}",
    'function keep(element,name){var saved=clock.saved.get(element)||{};if(!(name in saved))saved[name]=[element.style.getPropertyValue(name),element.style.getPropertyPriority(name)];clock.saved.set(element,saved)}',
    "function settle(animation){animation.pause();animation.currentTime=now();var effect=animation.effect,target=effect&&effect.target;if(!target||effect.pseudoElement||!target.style||typeof animation.commitStyles!=='function')return;try{effect.getKeyframes().forEach(function(frame){Object.keys(frame).forEach(function(key){if(key!=='offset'&&key!=='computedOffset'&&key!=='easing'&&key!=='composite')keep(target,cssName(key))})});animation.commitStyles()}catch(error){return}animation.cancel()}",
    "function count(n){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0}",
    "function timeOf(event){if(event.source!==win.parent)return null;var data=event.data;if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!==KEYS)return null;if(data.type!=='kadrion:time'||data.version!==1||data.instanceId!==INSTANCE||!count(data.requestId)||!count(data.timeUs))return null;return data}",
    "var fonts=doc.fonts,loaded=Promise.all(fonts?FONTS.map(function(family){return fonts.load('16px \"'+family+'\"')}):[]).then(function(){return fonts?fonts.ready:null});",
    "listen.call(win,'message',function(event){var data=timeOf(event);if(data===null)return;clock.timeUs=Math.max(0,data.timeUs-START);clock.state=hash(String(clock.timeUs),clock.seed)},true);",
    'function finish(event){var data=timeOf(event);if(data===null)return;var due=clock.frames,failure=null;clock.frames=[];restore();',
    'due.forEach(function(frame){try{frame.callback(now())}catch(error){if(failure===null)failure={error:error}}});',
    "if(typeof doc.getAnimations==='function'){doc.getAnimations().forEach(function(animation){if(clock.held.indexOf(animation)<0)clock.held.push(animation)});clock.held.forEach(settle)}",
    "if(clock.answers){var reply={type:'kadrion:time-ack',version:1,instanceId:INSTANCE,requestId:data.requestId,timeUs:data.timeUs};var send=function(){win.parent.postMessage(reply,'*')};loaded.then(send,send)}",
    'if(failure!==null)throw failure.error}',
    "listen.call(doc,'DOMContentLoaded',function(){listen.call(win,'message',finish)});",
    '})();',
  ].join('');
}

/**
 * The rest of the shell's head (D78): a face for every font of the element,
 * named by its asset ID, from its `data:` URL; the number and colour
 * parameters as custom properties of the root; and the managed clock with the
 * parameters as `kadrion.parameters`. A font whose URL is no `data:` URL of
 * base64 bytes is refused with `asset-url-invalid`: the policy admits no other.
 */
export function shellHead(node: CustomHtmlNode, assetUrls: AssetUrls): string {
  const faces = node.fontAssetIds.map((assetId) => {
    const url = assetUrls[assetId] ?? '';
    if (!FONT_URL.test(url)) {
      throw new RenderError(
        'asset-url-invalid',
        `The font "${assetId}" of the Custom HTML element "${node.id}" needs a data: URL of base64 bytes (D78).`,
      );
    }
    return `@font-face{font-family:"${assetId}";src:url("${url}")}`;
  });
  const properties = node.parameters
    .filter((parameter) => parameter.type === 'number' || parameter.type === 'color')
    .map(({ key, value }) => `--${key}:${String(value)}`);
  const style = [...faces, ...(properties.length > 0 ? [`:root{${properties.join(';')}}`] : [])];
  const values = Object.fromEntries(node.parameters.map(({ key, value }) => [key, value]));
  const script = managedClock(
    node.id,
    node.startUs,
    scriptJson(values),
    scriptJson(node.fontAssetIds),
  );
  // Spelled so that the runtime build never holds the sequence that would end
  // the script element of the render page it is inlined in (D25.2).
  const tag = ['scr', 'ipt'].join('');
  return `${style.length > 0 ? `<style>${style.join('')}</style>` : ''}<${tag}>${script}</${tag}></head>`;
}

/**
 * Set on a frame whose document was replaced after the shell loaded: a
 * navigation, a reload, or an error page (D23.9). It is never removed.
 */
export const NAVIGATED_ATTRIBUTE = 'data-kadrion-navigated';

/** The attributes of a mounted frame, sorted; anything else means the tree was altered. */
export const FRAME_ATTRIBUTES = 'sandbox,srcdoc,style';

/**
 * The `iframe` of one Custom HTML node. `sandbox` is set before `srcdoc`, and
 * both before the frame is attached: sandbox flags take effect when the frame
 * navigates, so a frame that loaded first would run unsandboxed.
 *
 * The frame hosts exactly one document, the shell: the first `load` is the
 * shell's, and every later one marks the frame with `NAVIGATED_ATTRIBUTE`
 * (D23.9). The listener is registered before any synchronization can register
 * its own, so it runs first.
 */
export function sandboxFrame(
  document: Document,
  node: CustomHtmlNode,
  assetUrls: AssetUrls,
): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', SANDBOX_TOKENS);
  frame.setAttribute('srcdoc', `${sandboxShell(node.id)}${shellHead(node, assetUrls)}${node.html}`);
  const styles: Readonly<Record<string, string>> = {
    display: 'block',
    width: cssPixels(node.width),
    height: cssPixels(node.height),
    // Longhands, so that every CSS Object Model reads back the same declarations.
    'border-top-style': 'none',
    'border-right-style': 'none',
    'border-bottom-style': 'none',
    'border-left-style': 'none',
  };
  for (const [name, value] of Object.entries(styles)) frame.style.setProperty(name, value);
  const loads = { count: 0 };
  frame.addEventListener('load', () => {
    loads.count += 1;
    if (loads.count > 1) frame.setAttribute(NAVIGATED_ATTRIBUTE, '');
  });
  return frame;
}
