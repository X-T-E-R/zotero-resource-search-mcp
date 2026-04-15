export class XmlParser {
  private static queryElements(node: Element | Document, tagName: string): Element[] {
    const direct = node.getElementsByTagName(tagName);
    if (direct.length > 0) {
      return Array.from(direct);
    }
    const namespaced = node.getElementsByTagNameNS("*", tagName);
    return Array.from(namespaced);
  }

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
    const el = this.queryElements(node, tagName)[0];
    return el ? (el.textContent ?? null) : null;
  }

  static getTextAll(node: Element | Document, tagName: string): string[] {
    const elements = this.queryElements(node, tagName);
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
    return this.queryElements(node, tagName);
  }

  static getAttribute(node: Element, attrName: string): string | null {
    return node.getAttribute(attrName);
  }

  static getTextContent(node: Element): string | null {
    return node.textContent ?? null;
  }
}
