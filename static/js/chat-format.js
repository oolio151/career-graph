"use strict";

// A small Markdown subset built exclusively with DOM text nodes. Model output
// cannot create raw HTML, links, images, scripts, styles, or event handlers.
function renderChatMarkdown(text) {
  const body = document.createElement('div');
  body.className = 'message-content';

  function inline(parent, value) {
    const tokens = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*|\[(S\d+)\]/g;
    let offset = 0;
    for (const match of value.matchAll(tokens)) {
      parent.append(document.createTextNode(value.slice(offset, match.index)));
      const tag = match[1] ? 'strong' : match[2] ? 'code' : match[3] ? 'em' : 'span';
      const node = document.createElement(tag);
      node.textContent = match[1] || match[2] || match[3] || `[${match[4]}]`;
      if (match[4]) {
        node.className = 'chat-citation';
        node.title = `Dataset source ${match[4]}; expand the records below for context`;
      }
      parent.append(node);
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(offset)));
  }

  let paragraph = null, list = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { paragraph = null; list = null; continue; }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const item = line.match(/^(?:([-*•])\s+|\d+[.)]\s+)(.+)$/);
    if (heading) {
      const node = document.createElement('h3');
      inline(node, heading[1]); body.append(node);
      paragraph = null; list = null;
    } else if (item) {
      const kind = item[1] ? 'UL' : 'OL';
      if (!list || list.tagName !== kind) {
        list = document.createElement(kind.toLowerCase());
        if (kind === 'OL') list.start = Number(line.match(/^\d+/)[0]) || 1;
        body.append(list);
      }
      const node = document.createElement('li');
      inline(node, item[2]); list.append(node); paragraph = null;
    } else {
      list = null;
      if (!paragraph) { paragraph = document.createElement('p'); body.append(paragraph); }
      else paragraph.append(document.createElement('br'));
      inline(paragraph, line);
    }
  }
  return body;
}
