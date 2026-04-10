export class XmlParser {
  static parse(xmlString: string): Document {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(`XML parse error: ${parseError.textContent}`);
    }
    return doc;
  }

  static getText(node: Element | Document, tagName: string): string | null {
    const el = node.getElementsByTagName(tagName)[0];
    return el ? (el.textContent ?? null) : null;
  }

  static getTextAll(node: Element | Document, tagName: string): string[] {
    const elements = node.getElementsByTagName(tagName);
    const results: string[] = [];
    for (let i = 0; i < elements.length; i++) {
      const text = elements[i].textContent;
      if (text !== null) {
        results.push(text);
      }
    }
    return results;
  }

  static getElements(node: Element | Document, tagName: string): Element[] {
    const nodeList = node.getElementsByTagName(tagName);
    const results: Element[] = [];
    for (let i = 0; i < nodeList.length; i++) {
      results.push(nodeList[i]);
    }
    return results;
  }

  static getAttribute(node: Element, attrName: string): string | null {
    return node.getAttribute(attrName);
  }
}
