#!/usr/bin/env node
import { createRequire as __jig_createRequire } from 'node:module';
const require = __jig_createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res2) => function __init() {
  return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res2 = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res2;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res3) => {
          data.res = res3;
          delete ctx.onCreate;
        };
        const res2 = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res2);
        return res2;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res2 = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res3 } of ctx.anchors.values())
            onAnchor(res3, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res2 }, "", res2) : res2;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map2 = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map2.items.push(value);
        return map2;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res2 = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res2 = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res2 += `${text[fold]}\\`;
          res2 += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res2;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res2 = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res2 : foldFlowLines.foldFlowLines(res2, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res2 = _stringify(type);
      if (res2 === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res2 = _stringify(t);
        if (res2 === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res2;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify2(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify2.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map2, value) {
      value = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (identity.isSeq(value))
        for (const it of value.items)
          mergeValue(ctx, map2, it);
      else if (Array.isArray(value))
        for (const it of value)
          mergeValue(ctx, map2, it);
      else
        mergeValue(ctx, map2, value);
    }
    function mergeValue(ctx, map2, value) {
      const source = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map2 instanceof Map) {
          if (!map2.has(key))
            map2.set(key, value2);
        } else if (map2 instanceof Set) {
          map2.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map2, key)) {
          Object.defineProperty(map2, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map2;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify2 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map2, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map2, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map2, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map2 instanceof Map) {
          map2.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map2 instanceof Set) {
          map2.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map2)
            Object.defineProperty(map2, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map2[stringKey] = jsValue;
        }
      }
      return map2;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify2.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify3(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify2.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map2 = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map2.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map2.items.sort(schema.sortMapEntries);
        }
        return map2;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map2 = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map2);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map2, item);
        return map2;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map2 = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map3, onError) {
        if (!identity.isMap(map3))
          onError("Expected a mapping for this tag");
        return map3;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map2;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^\d/.test(n)) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map2 = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map2.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map2 = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map2.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map2 = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map2);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map2.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map2.set(key, value);
        }
        return map2;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map2, onError) {
        if (identity.isMap(map2)) {
          if (map2.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map2);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map2;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res2 = parts.replace(/_/g, "").split(":").reduce((res3, p) => res3 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res2 : res2;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map2 = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map2.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map2 = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map2.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map2.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map2 = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map2.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify2.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify2.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res2 = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res3 } of ctx.anchors.values())
            onAnchor(res3, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res2 }, "", res2) : res2;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map2 = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep2, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep2?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep2) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map2.comment)
                map2.comment += "\n" + keyProps.comment;
              else
                map2.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map2.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep2 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep2, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map2.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map2.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map2.range = [bm.offset, offset, commentEnd ?? offset];
      return map2;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep2 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep2 + cb;
              sep2 = "";
              break;
            }
            case "newline":
              if (comment)
                sep2 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep2, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep2?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep2 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep2 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep2, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep2 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep2)
                for (const st of sep2) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep2, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map2 = coll;
            if (utilMapIncludes.mapIncludes(ctx, map2.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map2.items.push(pair);
          } else {
            const map2 = new YAMLMap.YAMLMap(ctx.schema);
            map2.flow = true;
            map2.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map2.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map2);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res2 = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res2) ? res2 : new Scalar.Scalar(res2);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep2 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep2 + indent.slice(trimIndent) + content;
          sep2 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep2 === " ")
            sep2 = "\n";
          else if (!prevMoreIndented && sep2 === "\n")
            sep2 = "\n\n";
          value += sep2 + indent.slice(trimIndent) + content;
          sep2 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep2 === "\n")
            value += "\n";
          else
            sep2 = "\n";
        } else {
          value += sep2 + content;
          sep2 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res2 = match[1];
      let sep2 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep2 === "\n")
            res2 += sep2;
          else
            sep2 = "\n";
        } else {
          res2 += sep2 + match[1];
          sep2 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res2 + sep2 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res2 = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res2 += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res2 += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = { x: 2, u: 4, U: 8 }[next];
            res2 += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res2 += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res2 += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res2 += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res2;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      if (isNaN(code)) {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
      return String.fromCodePoint(code);
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res2 = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res2) ? res2 : new Scalar.Scalar(res2);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          Array.prototype.push.apply(doc.errors, this.errors);
          Array.prototype.push.apply(doc.warnings, this.warnings);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify2 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res2 = "";
          for (const tok of token.props)
            res2 += stringifyToken(tok);
          return res2 + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res2 = "";
          for (const item of token.items)
            res2 += stringifyItem(item);
          return res2;
        }
        case "flow-collection": {
          let res2 = token.start.source;
          for (const item of token.items)
            res2 += stringifyItem(item);
          for (const st of token.end)
            res2 += st.source;
          return res2;
        }
        case "document": {
          let res2 = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res2 += st.source;
          return res2;
        }
        default: {
          let res2 = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res2 += st.source;
          return res2;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep2, value }) {
      let res2 = "";
      for (const st of start)
        res2 += st.source;
      if (key)
        res2 += stringifyToken(key);
      if (sep2)
        for (const st of sep2)
          res2 += st.source;
      if (value)
        res2 += stringifyToken(value);
      return res2;
    }
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return yield* this.parseBlockStart();
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        switch (this.charAt(0)) {
          case "!":
            return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "&":
            return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "-":
          // this is an error
          case "?":
          // this is an error outside flow collections
          case ":": {
            const inFlow = this.flowLevel > 0;
            const ch1 = this.charAt(1);
            if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
              if (!inFlow)
                this.indentNext = this.indentValue + 1;
              else if (this.flowKey)
                this.flowKey = false;
              return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
            }
          }
        }
        return 0;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                Array.prototype.push.apply(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              Array.prototype.push.apply(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep2;
          if (scalar.end) {
            sep2 = scalar.end;
            sep2.push(this.sourceToken);
            delete scalar.end;
          } else
            sep2 = [this.sourceToken];
          const map2 = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep2 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map2;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map2) {
        const it = map2.items[map2.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map2.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map2.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map2.indent)) {
                const prev = map2.items[map2.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  map2.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map2.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map2.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map2.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map2.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map2.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map2.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep2 = it.sep;
                  sep2.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep2 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map2.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map2.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map2);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map2.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep2 = fc.end.splice(1, fc.end.length);
            sep2.push(this.sourceToken);
            const map2 = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep2 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map2;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify2(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/runtime/util/interpolate.ts
function expandShim(input) {
  if (!input.includes("${")) return input;
  const matches = [...input.matchAll(tokenRegex)];
  if (matches.length === 0) return input;
  if (matches.length === 1) {
    const m = matches[0];
    if (m[0] === input) {
      return { "env.get": [m[1]] };
    }
  }
  const parts = [];
  let cursor = 0;
  for (const m of matches) {
    const start = m.index;
    if (start > cursor) parts.push(input.slice(cursor, start));
    parts.push({ "env.get": [m[1]] });
    cursor = start + m[0].length;
  }
  if (cursor < input.length) parts.push(input.slice(cursor));
  const cleaned = parts.filter((p) => !(typeof p === "string" && p.length === 0));
  if (cleaned.length === 1) {
    const only = cleaned[0];
    return only;
  }
  return { cat: cleaned };
}
function expandShimInTree(value) {
  if (typeof value === "string") return expandShim(value);
  if (Array.isArray(value)) return value.map(expandShimInTree);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandShimInTree(v);
    }
    return out;
  }
  return value;
}
var tokenRegex;
var init_interpolate = __esm({
  "src/runtime/util/interpolate.ts"() {
    "use strict";
    tokenRegex = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  }
});

// src/runtime/handlers/inline.ts
var init_inline = __esm({
  "src/runtime/handlers/inline.ts"() {
    "use strict";
  }
});

// src/runtime/handlers/types.ts
var init_types = __esm({
  "src/runtime/handlers/types.ts"() {
    "use strict";
  }
});

// src/runtime/util/template.ts
var init_template = __esm({
  "src/runtime/util/template.ts"() {
    "use strict";
  }
});

// src/runtime/handlers/exec.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync, DEFAULT_MAX_OUTPUT_BYTES;
var init_exec = __esm({
  "src/runtime/handlers/exec.ts"() {
    "use strict";
    init_types();
    init_template();
    execFileAsync = promisify(execFile);
    DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
  }
});

// node_modules/json-logic-engine/dist/esm/index.js
function precoerceNumber(item) {
  if (Number.isNaN(item)) throw NaN;
  if (!item) return item;
  if (item && typeof item === "object") throw NaN;
  return item;
}
function assertSize(arr, size) {
  if (!Array.isArray(arr) || arr.length < size) throw { type: "Invalid Arguments" };
  return arr;
}
function assertAllowedDepth(item, depthAllowed = 0) {
  if (!item) return item;
  if (depthAllowed === Infinity) return item;
  if (typeof item !== "object") return item;
  if (Array.isArray(item)) {
    for (let i = 0; i < item.length; i++) {
      if (typeof item[i] === "object" && item[i]) {
        if (depthAllowed === 0) throw { type: "Exceeded Allowed Depth" };
        assertAllowedDepth(item[i], depthAllowed - 1);
      }
    }
  } else {
    const keys = Object.keys(item);
    for (let i = 0; i < keys.length; i++) {
      const val = item[keys[i]];
      if (typeof val === "object" && val) {
        if (depthAllowed === 0) throw { type: "Exceeded Allowed Depth" };
        assertAllowedDepth(val, depthAllowed - 1);
      }
    }
  }
  return item;
}
function compareCheck(item, prev, strict) {
  if (strict || (typeof item === "string" || item === null) && (typeof prev === "string" || prev === null)) return item;
  if (Number.isNaN(+precoerceNumber(item)) && prev !== null) throw NaN;
  if (Number.isNaN(+precoerceNumber(prev))) throw NaN;
  if (prev === null && !item) return null;
  if (item === null && !prev) return 0;
  return item;
}
async function filter(arr, iter) {
  const result = [];
  let index = 0;
  for (const item of arr) {
    if (await iter(item, index++, arr)) result.push(item);
  }
  return result;
}
async function some(arr, iter) {
  let index = 0;
  for (const item of arr) {
    if (await iter(item, index++, arr)) return true;
  }
  return false;
}
async function every(arr, iter) {
  let index = 0;
  for (const item of arr) {
    if (!await iter(item, index++, arr)) return false;
  }
  return true;
}
async function map(arr, iter) {
  const result = [];
  let index = 0;
  for (const item of arr) {
    result.push(await iter(item, index++, arr));
  }
  return result;
}
async function reduce(arr, iter, defaultValue, maxDepth = 0) {
  if (arr.length === 0) {
    if (typeof defaultValue !== "undefined") return defaultValue;
    throw new Error("Array has no elements.");
  }
  const start = typeof defaultValue === "undefined" ? 1 : 0;
  let data = assertAllowedDepth(start ? arr[0] : defaultValue, maxDepth);
  for (let i = start; i < arr.length; i++) {
    data = assertAllowedDepth(await iter(data, arr[i]), maxDepth);
  }
  return data;
}
function isSync(item) {
  if (typeof item === "function") return item[Sync] === true;
  if (Array.isArray(item)) return item.every(isSync);
  if (item && item.asyncMethod && !item.method) return false;
  return true;
}
function declareSync(obj, sync = true) {
  obj[Sync] = sync;
  return obj;
}
function coerceArray(value) {
  return Array.isArray(value) ? value : [value];
}
function countArguments(fn) {
  if (!fn || typeof fn !== "function" || !fn.length) return 0;
  if (!counts.has(fn)) counts.set(fn, _countArguments(fn));
  return counts.get(fn);
}
function _countArguments(fn) {
  if (!fn || typeof fn !== "function" || !fn.length) return 0;
  let fnStr = fn.toString();
  if (fnStr[0] !== "(" && fnStr[0] !== "f") return 0;
  fnStr = fnStr.substring(fnStr.indexOf("("), fnStr.indexOf("{")).replace(/=>/g, "");
  const regex = /\.{3}|=/;
  if (regex.test(fnStr)) return 0;
  return fn.length;
}
function compileTemplate(strings, ...items) {
  let res2 = "";
  const buildState = this;
  for (let i = 0; i < strings.length; i++) {
    res2 += strings[i];
    if (i < items.length) {
      if (typeof items[i] === "function") {
        this.methods.push(items[i]);
        if (!isSync(items[i])) buildState.asyncDetected = true;
        res2 += (isSync(items[i]) ? "" : " await ") + "methods[" + (buildState.methods.length - 1) + "]";
      } else if (items[i] && typeof items[i][Compiled] !== "undefined") res2 += items[i][Compiled];
      else res2 += buildString(items[i], buildState);
    }
  }
  return { [Compiled]: res2 };
}
function isPrimitive(x, preserveObject) {
  if (typeof x === "number" && (x === Infinity || x === -Infinity || Number.isNaN(x))) return false;
  return x === null || x === void 0 || ["Number", "String", "Boolean"].includes(x.constructor.name) || !preserveObject && x.constructor.name === "Object";
}
function isDeterministic$1(method, engine2, buildState) {
  if (Array.isArray(method)) {
    return method.every((i) => isDeterministic$1(i, engine2, buildState));
  }
  if (method && typeof method === "object") {
    const func = Object.keys(method)[0];
    const lower = method[func];
    if (engine2.isData(method, func)) return true;
    if (func === void 0) return true;
    if (!engine2.methods[func]) throw { type: "Unknown Operator", key: func };
    if (engine2.methods[func].lazy) {
      return typeof engine2.methods[func].deterministic === "function" ? engine2.methods[func].deterministic(lower, buildState) : engine2.methods[func].deterministic;
    }
    return typeof engine2.methods[func].deterministic === "function" ? engine2.methods[func].deterministic(lower, buildState) : engine2.methods[func].deterministic && isDeterministic$1(lower, engine2, buildState);
  }
  return true;
}
function isDeepSync(method, engine2) {
  if (!engine2.async) return true;
  if (Array.isArray(method)) return method.every((i) => isDeepSync(i, engine2));
  if (method && typeof method === "object") {
    const keys = Object.keys(method);
    if (keys.length === 0) return true;
    const func = keys[0];
    const lower = method[func];
    if (!isSync(engine2.methods[func])) return false;
    if (engine2.methods[func].lazy) {
      if (typeof engine2.methods[func][Sync] === "function" && engine2.methods[func][Sync](method, { engine: engine2 })) return true;
      return false;
    }
    return isDeepSync(lower, engine2);
  }
  return true;
}
function buildString(method, buildState = {}) {
  const {
    notTraversed = [],
    async,
    processing = [],
    values = [],
    engine: engine2
  } = buildState;
  function pushValue(value, preserveObject = false) {
    if (isPrimitive(value, preserveObject)) return JSON.stringify(value);
    values.push(value);
    return `values[${values.length - 1}]`;
  }
  if (Array.isArray(method)) {
    let res2 = "";
    for (let i = 0; i < method.length; i++) {
      if (i > 0) res2 += ",";
      res2 += buildString(method[i], buildState);
    }
    return "[" + res2 + "]";
  }
  let asyncDetected = false;
  function makeAsync(result) {
    buildState.asyncDetected = buildState.asyncDetected || asyncDetected;
    if (async && asyncDetected) return `await ${result}`;
    return result;
  }
  if (method && typeof method === "object") {
    const keys = Object.keys(method);
    const func = keys[0];
    if (!func) return pushValue(method);
    if (!engine2.methods[func] || keys.length > 1) {
      if (engine2.isData(method, func)) return pushValue(method, true);
      throw { type: "Unknown Operator", key: func };
    }
    if (!buildState.engine.disableInline && engine2.methods[func] && isDeterministic$1(method, engine2, buildState)) {
      if (isDeepSync(method, engine2)) {
        return pushValue((engine2.fallback || engine2).run(method), true);
      } else if (!buildState.avoidInlineAsync) {
        processing.push(engine2.run(method).then((i) => pushValue(i)));
        return `__%%%${processing.length - 1}%%%__`;
      } else {
        buildState.asyncDetected = true;
        return `(await ${pushValue(engine2.run(method))})`;
      }
    }
    let lower = method[func];
    if ((!lower || typeof lower !== "object") && !engine2.methods[func].lazy) lower = [lower];
    if (engine2.methods[func] && engine2.methods[func].compile) {
      let str = engine2.methods[func].compile(lower, buildState);
      if (str[Compiled]) str = str[Compiled];
      if ((str || "").startsWith("await")) buildState.asyncDetected = true;
      if (str !== false) return str;
    }
    let coerce = engine2.methods[func].optimizeUnary ? "" : "coerceArray";
    if (!coerce && Array.isArray(lower) && lower.length === 1 && !Array.isArray(lower[0])) lower = lower[0];
    else if (coerce && Array.isArray(lower)) coerce = "";
    const argumentsDict = [", context", ", context, above", ", context, above, engine"];
    if (typeof engine2.methods[func] === "function") {
      asyncDetected = !isSync(engine2.methods[func]);
      const argumentsNeeded = argumentsDict[countArguments(engine2.methods[func]) - 1] || argumentsDict[2];
      return makeAsync(`engine.methods["${func}"](${coerce}(` + buildString(lower, buildState) + ")" + argumentsNeeded + ")");
    } else {
      asyncDetected = Boolean(async && engine2.methods[func] && engine2.methods[func].asyncMethod);
      const argCount = countArguments(asyncDetected ? engine2.methods[func].asyncMethod : engine2.methods[func].method);
      let argumentsNeeded = argumentsDict[argCount - 1] || argumentsDict[2];
      if (asyncDetected && typeof engine2.methods[func][Sync] === "function" && engine2.methods[func][Sync](lower, { engine: engine2 })) {
        asyncDetected = false;
        argumentsNeeded = argumentsNeeded.replace("engine", "engine.fallback");
      }
      if (engine2.methods[func] && !engine2.methods[func].lazy) {
        return makeAsync(`engine.methods["${func}"]${asyncDetected ? ".asyncMethod" : ".method"}(${coerce}(` + buildString(lower, buildState) + ")" + argumentsNeeded + ")");
      } else {
        notTraversed.push(lower);
        return makeAsync(`engine.methods["${func}"]${asyncDetected ? ".asyncMethod" : ".method"}(notTraversed[${notTraversed.length - 1}]` + argumentsNeeded + ")");
      }
    }
  }
  return pushValue(method);
}
function build(method, buildState = {}) {
  Object.assign(
    buildState,
    Object.assign(
      {
        notTraversed: [],
        methods: [],
        state: {},
        processing: [],
        async: buildState.engine.async,
        asyncDetected: false,
        values: [],
        compile: compileTemplate
      },
      buildState
    )
  );
  const str = buildString(method, buildState);
  return processBuiltString(method, str, buildState);
}
async function buildAsync(method, buildState = {}) {
  Object.assign(
    buildState,
    Object.assign(
      {
        notTraversed: [],
        methods: [],
        state: {},
        processing: [],
        async: buildState.engine.async,
        asyncDetected: false,
        values: [],
        compile: compileTemplate
      },
      buildState
    )
  );
  const str = buildString(method, buildState);
  buildState.processing = await Promise.all(buildState.processing || []);
  return processBuiltString(method, str, buildState);
}
function processBuiltString(method, str, buildState) {
  const {
    engine: engine2,
    methods,
    notTraversed,
    processing = [],
    values
  } = buildState;
  const above = [];
  processing.forEach((item, x) => {
    str = str.replace(`__%%%${x}%%%__`, item);
  });
  const final = `(values, methods, notTraversed, asyncIterators, engine, above, coerceArray, precoerceNumber, assertSize, compareCheck, assertAllowedDepth) => ${buildState.asyncDetected ? "async" : ""} (context ${buildState.extraArguments ? "," + buildState.extraArguments : ""}) => { ${str.includes("prev") ? "let prev;" : ""} const result = ${str}; return result }`;
  return Object.assign(
    (typeof globalThis !== "undefined" ? globalThis : global).eval(final)(values, methods, notTraversed, asyncIterators, engine2, above, coerceArray, precoerceNumber, assertSize, compareCheck, assertAllowedDepth),
    {
      [Sync]: !buildState.asyncDetected,
      deterministic: !str.includes("("),
      aboveDetected: typeof str === "string" && str.includes(", above")
    }
  );
}
function splitPathMemoized(str) {
  if (parsedPaths.has(str)) return parsedPaths.get(str);
  if (parsedPaths.size > 2048) parsedPaths.clear();
  const parts = splitPath(str);
  parsedPaths.set(str, parts);
  return parts;
}
function splitPath(str, separator = ".", escape = "\\", up = "/") {
  const parts = [];
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === escape) {
      if (str[i + 1] === separator || str[i + 1] === up) {
        current += str[i + 1];
        i++;
      } else if (str[i + 1] === escape) {
        current += escape;
        i++;
      } else current += escape;
    } else if (char === separator) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (parts.length !== str.length) parts.push(current);
  return parts;
}
function isDeterministic(method, engine2, buildState) {
  if (Array.isArray(method)) {
    return method.every((i) => isDeterministic(i, engine2, buildState));
  }
  if (method && typeof method === "object") {
    const func = Object.keys(method)[0];
    const lower = method[func];
    if (engine2.isData(method, func) || func === void 0) return true;
    if (!engine2.methods[func]) throw { type: "Unknown Operator", key: func };
    if (engine2.methods[func].lazy) {
      return typeof engine2.methods[func].deterministic === "function" ? engine2.methods[func].deterministic(lower, buildState) : engine2.methods[func].deterministic;
    }
    return typeof engine2.methods[func].deterministic === "function" ? engine2.methods[func].deterministic(lower, buildState) : engine2.methods[func].deterministic && isDeterministic(lower, engine2, buildState);
  }
  return true;
}
function isSyncDeep(method, engine2, buildState) {
  if (Array.isArray(method)) {
    return method.every((i) => isSyncDeep(i, engine2, buildState));
  }
  if (method && typeof method === "object") {
    const func = Object.keys(method)[0];
    const lower = method[func];
    if (engine2.isData(method, func) || func === void 0) return true;
    if (!engine2.methods[func]) throw { type: "Unknown Operator", key: func };
    if (engine2.methods[func].lazy) return typeof engine2.methods[func][Sync] === "function" ? engine2.methods[func][Sync](lower, buildState) : engine2.methods[func][Sync];
    return typeof engine2.methods[func][Sync] === "function" ? engine2.methods[func][Sync](lower, buildState) : engine2.methods[func][Sync] && isSyncDeep(lower, engine2, buildState);
  }
  return true;
}
function runOptimizedOrFallback(logic, engine2, data, above) {
  if (!logic) return logic;
  if (typeof logic !== "object") return logic;
  if (!engine2.disableInterpretedOptimization && engine2.optimizedMap.has(logic)) {
    const optimized = engine2.optimizedMap.get(logic);
    if (typeof optimized === "function") return optimized(data, above);
    return optimized;
  }
  return engine2.run(logic, data, { above });
}
function createComparator(name, func) {
  const opStr = { [Compiled]: name };
  const strict = name.length === 3;
  return {
    method: (args, context, above, engine2) => {
      if (!Array.isArray(args) || args.length <= 1) throw INVALID_ARGUMENTS;
      if (args.length === 2) {
        const a = runOptimizedOrFallback(args[0], engine2, context, above);
        const b = runOptimizedOrFallback(args[1], engine2, context, above);
        if (strict || (typeof a === "string" || a === null) && (typeof b === "string" || b === null)) return func(a, b);
        if (Number.isNaN(+precoerceNumber(a))) throw NaN;
        if (Number.isNaN(+precoerceNumber(b)) && a !== null) throw NaN;
        return func(+a, +b);
      }
      let prev = runOptimizedOrFallback(args[0], engine2, context, above);
      for (let i = 1; i < args.length; i++) {
        const current = runOptimizedOrFallback(args[i], engine2, context, above);
        if (strict || (typeof current === "string" || current === null) && (typeof prev === "string" || prev === null)) {
          if (!func(prev, current)) return false;
        }
        if (Number.isNaN(+precoerceNumber(current)) && prev !== null) throw NaN;
        if (i === 1 && Number.isNaN(+precoerceNumber(prev))) throw NaN;
        if (!func(+prev, +current)) return false;
        prev = current;
      }
      return true;
    },
    asyncMethod: async (args, context, above, engine2) => {
      if (!Array.isArray(args) || args.length <= 1) throw INVALID_ARGUMENTS;
      if (args.length === 2) {
        const a = await runOptimizedOrFallback(args[0], engine2, context, above);
        const b = await runOptimizedOrFallback(args[1], engine2, context, above);
        if (strict || (typeof a === "string" || a === null) && (typeof b === "string" || b === null)) return func(a, b);
        if (Number.isNaN(+precoerceNumber(a))) throw NaN;
        if (Number.isNaN(+precoerceNumber(b)) && a !== null) throw NaN;
        return func(+a, +b);
      }
      let prev = await runOptimizedOrFallback(args[0], engine2, context, above);
      for (let i = 1; i < args.length; i++) {
        const current = await runOptimizedOrFallback(args[i], engine2, context, above);
        if (strict || (typeof current === "string" || current === null) && (typeof prev === "string" || prev === null)) {
          if (!func(prev, current)) return false;
        }
        if (Number.isNaN(+precoerceNumber(current)) && prev !== null) throw NaN;
        if (i === 1 && Number.isNaN(+precoerceNumber(prev))) throw NaN;
        if (!func(+prev, +current)) return false;
        prev = current;
      }
      return true;
    },
    compile: (data, buildState) => {
      if (!Array.isArray(data)) return false;
      if (data.length < 2) return false;
      if (data.length === 2) return buildState.compile`((prev = ${data[0]}) ${opStr} compareCheck(${data[1]}, prev, ${strict}))`;
      let res2 = buildState.compile`((prev = ${data[0]}) ${opStr} (prev = compareCheck(${data[1]}, prev, ${strict})))`;
      for (let i = 2; i < data.length; i++) res2 = buildState.compile`(${res2} && prev ${opStr} (prev = compareCheck(${data[i]}, prev, ${strict})))`;
      return res2;
    },
    [OriginalImpl]: true,
    [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
    deterministic: (data, buildState) => isDeterministic(data, buildState.engine, buildState),
    lazy: true
  };
}
function createArrayIterativeMethod(name, useTruthy = false) {
  return {
    deterministic: (data, buildState) => {
      return isDeterministic(data[0], buildState.engine, buildState) && isDeterministic(data[1], buildState.engine, {
        ...buildState,
        insideIterator: true
      });
    },
    [OriginalImpl]: true,
    [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
    method: (input, context, above, engine2) => {
      if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
      let [selector, mapper] = input;
      selector = runOptimizedOrFallback(selector, engine2, context, above) || [];
      return selector[name]((i, index) => {
        if (!mapper || typeof mapper !== "object") return useTruthy ? engine2.truthy(mapper) : mapper;
        const result = runOptimizedOrFallback(mapper, engine2, i, [{ iterator: selector, index }, context, above]);
        return useTruthy ? engine2.truthy(result) : result;
      });
    },
    asyncMethod: async (input, context, above, engine2) => {
      if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
      let [selector, mapper] = input;
      selector = await engine2.run(selector, context, { above }) || [];
      return asyncIterators[name](selector, async (i, index) => {
        if (!mapper || typeof mapper !== "object") return useTruthy ? engine2.truthy(mapper) : mapper;
        const result = await engine2.run(mapper, i, {
          above: [{ iterator: selector, index }, context, above]
        });
        return useTruthy ? engine2.truthy(result) : result;
      });
    },
    compile: (data, buildState) => {
      if (!Array.isArray(data)) throw INVALID_ARGUMENTS;
      const { async } = buildState;
      const [selector, mapper] = data;
      const mapState = {
        ...buildState,
        avoidInlineAsync: true,
        iteratorCompile: true,
        extraArguments: "index, above"
      };
      const method = build(mapper, mapState);
      const aboveArray = method.aboveDetected ? buildState.compile`[{ iterator: z, index: x }, context, above]` : buildState.compile`null`;
      const useTruthyMethod = useTruthy ? buildState.compile`engine.truthy` : buildState.compile``;
      if (async) {
        if (!isSync(method)) {
          buildState.asyncDetected = true;
          return buildState.compile`await asyncIterators[${name}](${selector} || [], async (i, x, z) => ${useTruthyMethod}(${method}(i, x, ${aboveArray})))`;
        }
      }
      return buildState.compile`(${selector} || [])[${name}]((i, x, z) => ${useTruthyMethod}(${method}(i, x, ${aboveArray})))`;
    },
    lazy: true
  };
}
function numberCoercion(i, buildState) {
  if (Array.isArray(i)) return precoerceNumber(NaN);
  if (typeof i === "number" || typeof i === "boolean") return "+" + buildString(i, buildState);
  if (typeof i === "string") return "+" + precoerceNumber(+i);
  const f = buildString(i, buildState);
  if (/^-?\d+(\.\d*)?$/.test(f)) return "+" + f;
  if (f.startsWith('"')) return "+" + precoerceNumber(+JSON.parse(f));
  if (f === "true") return "1";
  if (f === "false") return "0";
  if (f === "null") return "0";
  if (f.startsWith("[") || f.startsWith("{")) return precoerceNumber(NaN);
  return `(+precoerceNumber(${f}))`;
}
function getMethod$1(logic, engine2, methodName, above) {
  const method = engine2.methods[methodName];
  const called = method.method ? method.method : method;
  if (method.lazy) {
    const args2 = logic[methodName];
    return (data, abv) => called(args2, data, abv || above, engine2);
  }
  let args = logic[methodName];
  if ((!args || typeof args !== "object") && !method.optimizeUnary) args = [args];
  if (Array.isArray(args) && args.length === 1 && method.optimizeUnary && !Array.isArray(args[0])) args = args[0];
  if (Array.isArray(args)) {
    const optimizedArgs = args.map((l) => optimize$1(l, engine2, above));
    if (optimizedArgs.every((l) => typeof l !== "function")) return (data, abv) => called(optimizedArgs, data, abv || above, engine2);
    if (optimizedArgs.length === 1) {
      const first = optimizedArgs[0];
      return (data, abv) => called([first(data, abv)], data, abv || above, engine2);
    }
    if (optimizedArgs.length === 2) {
      const [first, second] = optimizedArgs;
      if (typeof first === "function" && typeof second === "function") return (data, abv) => called([first(data, abv), second(data, abv)], data, abv || above, engine2);
      if (typeof first === "function") return (data, abv) => called([first(data, abv), second], data, abv || above, engine2);
      return (data, abv) => called([first, second(data, abv)], data, abv || above, engine2);
    }
    return (data, abv) => {
      const evaluatedArgs = optimizedArgs.map((l) => typeof l === "function" ? l(data, abv) : l);
      return called(evaluatedArgs, data, abv || above, engine2);
    };
  } else {
    const optimizedArgs = optimize$1(args, engine2, above);
    if (method.optimizeUnary) {
      const singleLayer = (data) => !data || typeof data[optimizedArgs] === "undefined" || typeof data[optimizedArgs] === "function" && !engine2.allowFunctions ? null : data[optimizedArgs];
      if (typeof optimizedArgs === "function") return (data, abv) => called(optimizedArgs(data, abv), data, abv || above, engine2);
      if ((methodName === "var" || methodName === "val") && engine2.methods[methodName][OriginalImpl]) {
        if (!optimizedArgs && methodName !== "val") return (data) => data === null || typeof data === "undefined" || typeof data === "function" && !engine2.allowFunctions ? null : data;
        if (methodName === "val" || typeof optimizedArgs === "number" || !optimizedArgs.includes(".") && !optimizedArgs.includes("\\")) return singleLayer;
        if (methodName === "var" && !optimizedArgs.startsWith("../")) {
          const path = splitPathMemoized(String(optimizedArgs));
          let prev;
          if (path.length === 2) {
            const [first, second] = path;
            return (data) => (typeof (prev = data && data[first] && data[first][second]) !== "function" || engine2.allowFunctions) && typeof prev !== "undefined" ? prev : null;
          }
          if (path.length === 3) {
            const [first, second, third] = path;
            return (data) => (typeof (prev = data && data[first] && data[first][second] && data[first][second][third]) !== "function" || engine2.allowFunctions) && typeof prev !== "undefined" ? prev : null;
          }
        }
      }
      return (data, abv) => called(optimizedArgs, data, abv || above, engine2);
    }
    if (typeof optimizedArgs === "function") return (data, abv) => called(coerceArray(optimizedArgs(data, abv)), data, abv || above, engine2);
    return (data, abv) => called(coerceArray(optimizedArgs), data, abv || above, engine2);
  }
}
function checkIdioms(logic, engine2, above) {
  if (logic.val && engine2.methods.val[OriginalImpl] && Array.isArray(logic.val) && logic.val.length <= 3 && logic.val.every((i) => typeof i !== "object")) {
    let prev;
    if (logic.val.length === 1) {
      const first = logic.val[0];
      return (data) => (typeof (prev = data && data[first]) !== "function" || engine2.allowFunctions) && typeof prev !== "undefined" ? prev : null;
    }
    if (logic.val.length === 2) {
      const [first, second] = logic.val;
      return (data) => (typeof (prev = data && data[first] && data[first][second]) !== "function" || engine2.allowFunctions) && typeof prev !== "undefined" ? prev : null;
    }
    if (logic.val.length === 3) {
      const [first, second, third] = logic.val;
      return (data) => (typeof (prev = data && data[first] && data[first][second] && data[first][second][third]) !== "function" || engine2.allowFunctions) && typeof prev !== "undefined" ? prev : null;
    }
  }
  if ((logic.if || logic["?:"]) && engine2.methods.if[OriginalImpl] && Array.isArray(logic.if || logic["?:"]) && (logic.if || logic["?:"]).length === 3) {
    const [condition, truthy, falsy] = logic.if || logic["?:"];
    const C = optimize$1(condition, engine2, above);
    const T = optimize$1(truthy, engine2, above);
    const F = optimize$1(falsy, engine2, above);
    if (typeof C === "function" && typeof T === "function" && typeof F === "function") return (data, abv) => engine2.truthy(C(data, abv)) ? T(data, abv) : F(data, abv);
    if (typeof C === "function" && typeof T === "function") return (data, abv) => engine2.truthy(C(data, abv)) ? T(data, abv) : F;
    if (typeof C === "function" && typeof F === "function") return (data, abv) => engine2.truthy(C(data, abv)) ? T : F(data, abv);
    if (typeof C === "function") return (data, abv) => engine2.truthy(C(data, abv)) ? T : F;
    return engine2.truthy(C) ? T : F;
  }
  if (logic.filter && engine2.methods.filter[OriginalImpl] && Array.isArray(logic.filter) && logic.filter.length === 2) {
    const [collection, filter2] = logic.filter;
    const filterF = optimize$1(filter2, engine2, above);
    if (typeof filterF !== "function") return engine2.truthy(filterF) ? optimize$1(collection, engine2, above) : [];
  }
  for (const comparison in comparisons) {
    if (logic[comparison] && Array.isArray(logic[comparison]) && engine2.methods[comparison][OriginalImpl]) {
      const _comparisonFunc = comparisons[comparison];
      const comparisonFunc = comparison.length === 3 ? _comparisonFunc : function comparisonFunc2(a, b) {
        if ((typeof a === "string" || a === null) && (typeof b === "string" || b === null)) return _comparisonFunc(a, b);
        if (Number.isNaN(+precoerceNumber(a))) throw NaN;
        if (Number.isNaN(+precoerceNumber(b)) && a !== null) throw NaN;
        return _comparisonFunc(+a, +b);
      };
      if (logic[comparison].length === 2) {
        const [a, b] = logic[comparison];
        const A = optimize$1(a, engine2, above);
        const B = optimize$1(b, engine2, above);
        if (typeof A === "function" && typeof B === "function") return (data, abv) => comparisonFunc(A(data, abv), B(data, abv));
        if (typeof A === "function") return (data, abv) => comparisonFunc(A(data, abv), B);
        if (typeof B === "function") return (data, abv) => comparisonFunc(A, B(data, abv));
        return comparisonFunc(A, B);
      }
      if (logic[comparison].length === 3) {
        const [a, b, c] = logic[comparison];
        const A = optimize$1(a, engine2, above);
        const B = optimize$1(b, engine2, above);
        const C = optimize$1(c, engine2, above);
        let prev;
        if (typeof A === "function" && typeof B === "function" && typeof C === "function") return (data, abv) => comparisonFunc(A(data, abv), prev = B(data, abv)) && comparisonFunc(prev, C(data, abv));
        if (typeof A === "function" && typeof B === "function") return (data, abv) => comparisonFunc(A(data, abv), prev = B(data, abv)) && comparisonFunc(prev, C);
        if (typeof A === "function" && typeof C === "function") return (data, abv) => comparisonFunc(A(data, abv), B) && comparisonFunc(B, C(data, abv));
        if (typeof B === "function" && typeof C === "function") return (data, abv) => comparisonFunc(A, prev = B(data, abv)) && comparisonFunc(prev, C(data, abv));
        if (typeof A === "function") return (data, abv) => comparisonFunc(A(data, abv), B) && comparisonFunc(B, C);
        if (typeof B === "function") return (data, abv) => comparisonFunc(A, prev = B(data, abv)) && comparisonFunc(prev, C);
        if (typeof C === "function") return (data, abv) => comparisonFunc(A, B) && comparisonFunc(B, C(data, abv));
        return comparisonFunc(A, B) && comparisonFunc(B, C);
      }
    }
  }
  if (logic.reduce && Array.isArray(logic.reduce)) {
    let [root, mapper, defaultValue] = logic.reduce;
    if (mapper["+"] && mapper["+"].length === 2 && (mapper["+"][0] || 0).var && (mapper["+"][1] || 0).var) {
      const accumulatorFound = mapper["+"][0].var === "accumulator" || mapper["+"][1].var === "accumulator";
      const currentFound = mapper["+"][0].var === "current" || mapper["+"][1].var === "current";
      defaultValue = defaultValue || 0;
      if (accumulatorFound && currentFound) return optimize$1({ "+": [{ "+": root }, defaultValue] }, engine2, above);
    }
    if (mapper["*"] && mapper["*"].length === 2 && (mapper["*"][0] || 0).var && (mapper["*"][1] || 0).var) {
      const accumulatorFound = mapper["*"][0].var === "accumulator" || mapper["*"][1].var === "accumulator";
      const currentFound = mapper["*"][0].var === "current" || mapper["*"][1].var === "current";
      defaultValue = typeof defaultValue === "undefined" ? 1 : defaultValue;
      if (accumulatorFound && currentFound) return optimize$1({ "*": [{ "*": root }, defaultValue] }, engine2, above);
    }
  }
}
function optimize$1(logic, engine2, above = []) {
  if (Array.isArray(logic)) {
    const arr = logic.map((l) => optimize$1(l, engine2, above));
    if (arr.every((l) => typeof l !== "function")) return arr;
    return (data, abv) => arr.map((l) => typeof l === "function" ? l(data, abv) : l);
  }
  if (logic && typeof logic === "object") {
    const idiomEnhancement = checkIdioms(logic, engine2, above);
    if (typeof idiomEnhancement !== "undefined") return idiomEnhancement;
    const keys = Object.keys(logic);
    const methodName = keys[0];
    if (keys.length === 0) return logic;
    const isData = engine2.isData(logic, methodName);
    if (isData) return () => logic;
    if (keys.length > 1) throw { type: "Unknown Operator" };
    const deterministic = !engine2.disableInline && isDeterministic$1(logic, engine2, { engine: engine2 });
    if (methodName in engine2.methods) {
      const result = getMethod$1(logic, engine2, methodName, above);
      if (deterministic) return result();
      return result;
    }
    throw { type: "Unknown Operator", key: methodName };
  }
  return logic;
}
function getMethod(logic, engine2, methodName, above) {
  const method = engine2.methods[methodName];
  const called = method.asyncMethod ? method.asyncMethod : method.method ? method.method : method;
  if (method.lazy) {
    if (typeof method[Sync] === "function" && method[Sync](logic, { engine: engine2 })) {
      const called2 = method.method ? method.method : method;
      return declareSync((data, abv) => called2(logic[methodName], data, abv || above, engine2.fallback), true);
    }
    const args2 = logic[methodName];
    return (data, abv) => called(args2, data, abv || above, engine2);
  }
  let args = logic[methodName];
  if ((!args || typeof args !== "object") && !method.optimizeUnary) args = [args];
  if (Array.isArray(args) && args.length === 1 && method.optimizeUnary && !Array.isArray(args[0])) args = args[0];
  if (Array.isArray(args)) {
    const optimizedArgs = args.map((l) => optimize(l, engine2, above));
    if (isSync(optimizedArgs) && (method.method || method[Sync])) {
      const called2 = method.method ? method.method : method;
      return declareSync((data, abv) => {
        const evaluatedArgs = optimizedArgs.map((l) => typeof l === "function" ? l(data, abv) : l);
        return called2(evaluatedArgs, data, abv || above, engine2.fallback);
      }, true);
    }
    return async (data, abv) => {
      const evaluatedArgs = await map(optimizedArgs, (l) => typeof l === "function" ? l(data, abv) : l);
      return called(evaluatedArgs, data, abv || above, engine2);
    };
  } else {
    const optimizedArgs = optimize(args, engine2, above);
    if (isSync(optimizedArgs) && (method.method || method[Sync])) {
      const called2 = method.method ? method.method : method;
      if ((methodName === "var" || methodName === "val") && engine2.methods[methodName][OriginalImpl] && (typeof optimizedArgs === "string" && !optimizedArgs.includes(".") && !optimizedArgs.includes("\\") || !optimizedArgs || typeof optimizedArgs === "number")) {
        if (!optimizedArgs && methodName !== "val") return declareSync((data) => !data || typeof data === "undefined" || typeof data === "function" && !engine2.allowFunctions ? null : data);
        return declareSync((data) => !data || typeof data[optimizedArgs] === "undefined" || typeof data[optimizedArgs] === "function" && !engine2.allowFunctions ? null : data[optimizedArgs]);
      }
      if (method.optimizeUnary) return declareSync((data, abv) => called2(typeof optimizedArgs === "function" ? optimizedArgs(data, abv) : optimizedArgs, data, abv || above, engine2.fallback), true);
      return declareSync((data, abv) => called2(coerceArray(typeof optimizedArgs === "function" ? optimizedArgs(data, abv) : optimizedArgs), data, abv || above, engine2), true);
    }
    if (method.optimizeUnary) return async (data, abv) => called(typeof optimizedArgs === "function" ? await optimizedArgs(data, abv) : optimizedArgs, data, abv || above, engine2);
    return async (data, abv) => called(coerceArray(typeof optimizedArgs === "function" ? await optimizedArgs(data, abv) : optimizedArgs), data, abv || above, engine2);
  }
}
function optimize(logic, engine2, above = []) {
  engine2.fallback.allowFunctions = engine2.allowFunctions;
  if (Array.isArray(logic)) {
    const arr = logic.map((l) => optimize(l, engine2, above));
    if (arr.every((l) => typeof l !== "function")) return arr;
    if (isSync(arr)) return declareSync((data, abv) => arr.map((l) => typeof l === "function" ? l(data, abv) : l), true);
    return async (data, abv) => map(arr, (l) => typeof l === "function" ? l(data, abv) : l);
  }
  if (logic && typeof logic === "object") {
    const keys = Object.keys(logic);
    const methodName = keys[0];
    if (keys.length === 0) return logic;
    const isData = engine2.isData(logic, methodName);
    if (isData) return () => logic;
    if (keys.length > 1) throw { type: "Unknown Operator" };
    const deterministic = !engine2.disableInline && isDeterministic$1(logic, engine2, { engine: engine2 });
    if (methodName in engine2.methods) {
      const result = getMethod(logic, engine2, methodName, above);
      if (deterministic) {
        let computed;
        if (isSync(result)) {
          return declareSync(() => {
            if (!computed) computed = result();
            return computed;
          }, true);
        }
        return async () => {
          if (!computed) computed = await result();
          return computed;
        };
      }
      return result;
    }
    throw { type: "Unknown Operator", key: methodName };
  }
  return logic;
}
var asyncIterators, Sync, Compiled, OriginalImpl, Unfound, counts, getIsOptionalChainingSupported, res, parsedPaths, legacyMethods, legacyMethods$1, INVALID_ARGUMENTS, oldAll, defaultMethods, defaultMethods$1, omitUndefined, comparisons, LogicEngine, AsyncLogicEngine;
var init_esm = __esm({
  "node_modules/json-logic-engine/dist/esm/index.js"() {
    asyncIterators = {
      filter,
      some,
      every,
      map,
      reduce
    };
    Sync = /* @__PURE__ */ Symbol.for("json_logic_sync");
    Compiled = /* @__PURE__ */ Symbol.for("json_logic_compiled");
    OriginalImpl = /* @__PURE__ */ Symbol.for("json_logic_original");
    Unfound = /* @__PURE__ */ Symbol.for("json_logic_unfound");
    counts = /* @__PURE__ */ new WeakMap();
    getIsOptionalChainingSupported = () => {
      if (typeof res !== "undefined") return res;
      try {
        const test = {};
        const isUndefined = (typeof globalThis !== "undefined" ? globalThis : global).eval("(test) => test?.foo?.bar")(test);
        return res = isUndefined === void 0;
      } catch (err) {
        return res = false;
      }
    };
    parsedPaths = /* @__PURE__ */ new Map();
    legacyMethods = {
      get: {
        [Sync]: true,
        method: ([data, key, defaultValue], context, above, engine2) => {
          const notFound = defaultValue === void 0 ? null : defaultValue;
          const subProps = splitPathMemoized(String(key));
          for (let i = 0; i < subProps.length; i++) {
            if (data === null || data === void 0) return notFound;
            data = data[subProps[i]];
            if (data === void 0) return notFound;
          }
          if (engine2.allowFunctions || typeof data[key] !== "function") return data;
          return null;
        },
        deterministic: true,
        compile: (data, buildState) => {
          let defaultValue = null;
          let key = data;
          let obj = null;
          if (Array.isArray(data) && data.length <= 3) {
            obj = data[0];
            key = data[1];
            defaultValue = typeof data[2] === "undefined" ? null : data[2];
            if (key && typeof key === "object") return false;
            key = key.toString();
            const pieces = splitPathMemoized(key);
            if (!getIsOptionalChainingSupported()) {
              return `(((a,b) => (typeof a === 'undefined' || a === null) ? b : a)(${pieces.reduce(
                (text, i) => `(${text}||0)[${JSON.stringify(i)}]`,
                `(${buildString(obj, buildState)}||0)`
              )}, ${buildString(defaultValue, buildState)}))`;
            }
            return `((${buildString(obj, buildState)})${pieces.map((i) => `?.[${buildString(i, buildState)}]`).join("")} ?? ${buildString(defaultValue, buildState)})`;
          }
          return false;
        }
      },
      var: {
        [OriginalImpl]: true,
        [Sync]: true,
        method: (key, context, above, engine2) => {
          let b;
          if (Array.isArray(key)) {
            b = key[1];
            key = key[0];
          }
          let iter = 0;
          while (typeof key === "string" && key.startsWith("../") && iter < above.length) {
            context = above[iter++];
            key = key.substring(3);
            if (iter === above.length && Array.isArray(context)) {
              iter = 0;
              above = context;
              context = above[iter++];
            }
          }
          const notFound = b === void 0 ? null : b;
          if (typeof key === "undefined" || key === "" || key === null) {
            if (engine2.allowFunctions || typeof context !== "function") return context;
            return null;
          }
          const subProps = splitPathMemoized(String(key));
          for (let i = 0; i < subProps.length; i++) {
            if (context === null || context === void 0) return notFound;
            context = context[subProps[i]];
            if (context === void 0) return notFound;
          }
          if (engine2.allowFunctions || typeof context !== "function") return context;
          return null;
        },
        deterministic: (data, buildState) => buildState.insideIterator && !String(data).includes("../../"),
        optimizeUnary: true,
        compile: (data, buildState) => {
          let key = data;
          let defaultValue = null;
          if (!key || typeof data === "string" || typeof data === "number" || Array.isArray(data) && data.length <= 2) {
            if (Array.isArray(data)) {
              key = data[0];
              defaultValue = typeof data[1] === "undefined" ? null : data[1];
            }
            if (key === "../index" && buildState.iteratorCompile) return "index";
            if (typeof key === "undefined" || key === null || key === "") return "context";
            if (typeof key !== "string" && typeof key !== "number") return false;
            key = key.toString();
            if (key.includes("../")) return false;
            const pieces = splitPathMemoized(key);
            if (!getIsOptionalChainingSupported()) {
              const res3 = `((((a,b) => (typeof a === 'undefined' || a === null) ? b : a)(${pieces.reduce(
                (text, i) => `(${text}||0)[${JSON.stringify(i)}]`,
                "(context||0)"
              )}, ${buildString(defaultValue, buildState)})))`;
              if (buildState.engine.allowFunctions) return res3;
              return `(typeof (prev = ${res3}) === 'function' ? null : prev)`;
            }
            const res2 = `(context${pieces.map((i) => `?.[${JSON.stringify(i)}]`).join("")} ?? ${buildString(defaultValue, buildState)})`;
            if (buildState.engine.allowFunctions) return res2;
            return `(typeof (prev = ${res2}) === 'function' ? null : prev)`;
          }
          return false;
        }
      },
      missing: {
        [Sync]: true,
        optimizeUnary: false,
        method: (checked, context) => {
          if (!checked.length) return [];
          const missing = [];
          for (let i = 0; i < checked.length; i++) {
            const path = splitPathMemoized(String(checked[i]));
            let data = context;
            let found = true;
            for (let j = 0; j < path.length; j++) {
              if (!data) {
                found = false;
                break;
              }
              data = data[path[j]];
              if (data === void 0) {
                found = false;
                break;
              }
            }
            if (!found) missing.push(checked[i]);
          }
          return missing;
        },
        compile: (data, buildState) => {
          if (!Array.isArray(data)) return false;
          if (data.length === 0) return buildState.compile`[]`;
          if (data.length === 1 && typeof data[0] === "string" && !data[0].includes(".")) return buildState.compile`(context || 0)[${data[0]}] === undefined ? [${data[0]}] : []`;
          if (data.length === 2 && typeof data[0] === "string" && typeof data[1] === "string" && !data[0].includes(".") && !data[1].includes(".")) return buildState.compile`(context || 0)[${data[0]}] === undefined ? (context || 0)[${data[1]}] === undefined ? [${data[0]}, ${data[1]}] : [${data[0]}] : (context || 0)[${data[1]}] === undefined ? [${data[1]}] : []`;
          return false;
        },
        deterministic: (data, buildState) => {
          if (Array.isArray(data) && data.length === 0) return true;
          return false;
        }
      },
      missing_some: {
        [Sync]: true,
        optimizeUnary: false,
        method: ([needCount, options], context) => {
          const missing = legacyMethods.missing.method(options, context);
          if (options.length - missing.length >= needCount) return [];
          return missing;
        },
        compile: ([needCount, options], buildState) => {
          if (!Array.isArray(options)) return false;
          let compilation = legacyMethods.missing.compile(options, buildState);
          if (!compilation) compilation = buildState.compile`engine.methods.missing.method(${{ [Compiled]: JSON.stringify(options) }}, context)`;
          return buildState.compile`${options.length} - (prev = ${compilation}).length < ${needCount} ? prev : []`;
        },
        deterministic: false
      }
    };
    legacyMethods$1 = { ...legacyMethods };
    INVALID_ARGUMENTS = { type: "Invalid Arguments" };
    oldAll = createArrayIterativeMethod("every", true);
    defaultMethods = {
      "+": (data) => {
        if (!data) return 0;
        if (typeof data === "string") return precoerceNumber(+data);
        if (typeof data === "number") return precoerceNumber(+data);
        if (typeof data === "boolean") return precoerceNumber(+data);
        if (typeof data === "object" && !Array.isArray(data)) throw NaN;
        let res2 = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] && typeof data[i] === "object") throw NaN;
          res2 += +data[i];
        }
        if (Number.isNaN(res2)) throw NaN;
        return res2;
      },
      "*": (data) => {
        if (data.length === 0) return 1;
        let res2 = 1;
        for (let i = 0; i < data.length; i++) {
          if (data[i] && typeof data[i] === "object") throw NaN;
          res2 *= +data[i];
        }
        if (Number.isNaN(res2)) throw NaN;
        return res2;
      },
      "/": (data) => {
        if (data[0] && typeof data[0] === "object") throw NaN;
        if (data.length === 0) throw INVALID_ARGUMENTS;
        if (data.length === 1) {
          if (!+data[0] || data[0] && typeof data[0] === "object") throw NaN;
          return 1 / +data[0];
        }
        let res2 = +data[0];
        for (let i = 1; i < data.length; i++) {
          if (data[i] && typeof data[i] === "object" || !data[i]) throw NaN;
          res2 /= +data[i];
        }
        if (Number.isNaN(res2) || res2 === Infinity) throw NaN;
        return res2;
      },
      "-": (data) => {
        if (!data) return 0;
        if (typeof data === "string") return precoerceNumber(-data);
        if (typeof data === "number") return precoerceNumber(-data);
        if (typeof data === "boolean") return precoerceNumber(-data);
        if (typeof data === "object" && !Array.isArray(data)) throw NaN;
        if (data[0] && typeof data[0] === "object") throw NaN;
        if (data.length === 0) throw INVALID_ARGUMENTS;
        if (data.length === 1) return -data[0];
        let res2 = data[0];
        for (let i = 1; i < data.length; i++) {
          if (data[i] && typeof data[i] === "object") throw NaN;
          res2 -= +data[i];
        }
        if (Number.isNaN(res2)) throw NaN;
        return res2;
      },
      "%": (data) => {
        if (data[0] && typeof data[0] === "object") throw NaN;
        if (data.length < 2) throw INVALID_ARGUMENTS;
        let res2 = +data[0];
        for (let i = 1; i < data.length; i++) {
          if (data[i] && typeof data[i] === "object") throw NaN;
          res2 %= +data[i];
        }
        if (Number.isNaN(res2)) throw NaN;
        return res2;
      },
      throw: (type) => {
        if (Array.isArray(type)) type = type[0];
        if (typeof type === "object") throw type;
        throw { type };
      },
      max: (data) => {
        if (!data.length || typeof data[0] !== "number") throw INVALID_ARGUMENTS;
        let max = data[0];
        for (let i = 1; i < data.length; i++) {
          if (typeof data[i] !== "number") throw INVALID_ARGUMENTS;
          if (data[i] > max) max = data[i];
        }
        return max;
      },
      min: (data) => {
        if (!data.length || typeof data[0] !== "number") throw INVALID_ARGUMENTS;
        let min = data[0];
        for (let i = 1; i < data.length; i++) {
          if (typeof data[i] !== "number") throw INVALID_ARGUMENTS;
          if (data[i] < min) min = data[i];
        }
        return min;
      },
      in: ([item, array]) => (array || []).includes(item),
      preserve: {
        lazy: true,
        method: declareSync((i) => i, true),
        [Sync]: () => true
      },
      if: {
        [OriginalImpl]: true,
        method: (input, context, above, engine2) => {
          if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
          if (input.length === 1) return runOptimizedOrFallback(input[0], engine2, context, above);
          if (input.length < 2) return null;
          input = [...input];
          if (input.length % 2 !== 1) input.push(null);
          const onFalse = input.pop();
          while (input.length) {
            const check = input.shift();
            const onTrue = input.shift();
            const test = runOptimizedOrFallback(check, engine2, context, above);
            if (engine2.truthy(test)) return runOptimizedOrFallback(onTrue, engine2, context, above);
          }
          return runOptimizedOrFallback(onFalse, engine2, context, above);
        },
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        deterministic: (data, buildState) => {
          return isDeterministic(data, buildState.engine, buildState);
        },
        asyncMethod: async (input, context, above, engine2) => {
          if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
          if (input.length === 1) return engine2.run(input[0], context, { above });
          if (input.length < 2) return null;
          input = [...input];
          if (input.length % 2 !== 1) input.push(null);
          const onFalse = input.pop();
          while (input.length) {
            const check = input.shift();
            const onTrue = input.shift();
            const test = await engine2.run(check, context, { above });
            if (engine2.truthy(test)) return engine2.run(onTrue, context, { above });
          }
          return engine2.run(onFalse, context, { above });
        },
        lazy: true
      },
      "<": createComparator("<", (a, b) => a < b),
      "<=": createComparator("<=", (a, b) => a <= b),
      ">": createComparator(">", (a, b) => a > b),
      ">=": createComparator(">=", (a, b) => a >= b),
      // eslint-disable-next-line eqeqeq
      "==": createComparator("==", (a, b) => a == b),
      "===": createComparator("===", (a, b) => a === b),
      // eslint-disable-next-line eqeqeq
      "!=": createComparator("!=", (a, b) => a != b),
      "!==": createComparator("!==", (a, b) => a !== b),
      or: {
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        method: (arr, context, above, engine2) => {
          if (!Array.isArray(arr)) throw INVALID_ARGUMENTS;
          if (!arr.length) return null;
          let item;
          for (let i = 0; i < arr.length; i++) {
            item = runOptimizedOrFallback(arr[i], engine2, context, above);
            if (engine2.truthy(item)) return item;
          }
          return item;
        },
        asyncMethod: async (arr, _1, _2, engine2) => {
          if (!Array.isArray(arr)) throw INVALID_ARGUMENTS;
          if (!arr.length) return null;
          let item;
          for (let i = 0; i < arr.length; i++) {
            item = await engine2.run(arr[i], _1, { above: _2 });
            if (engine2.truthy(item)) return item;
          }
          return item;
        },
        deterministic: (data, buildState) => isDeterministic(data, buildState.engine, buildState),
        compile: (data, buildState) => {
          let res2 = buildState.compile``;
          if (Array.isArray(data)) {
            if (!data.length) return buildState.compile`null`;
            for (let i = 0; i < data.length; i++) res2 = buildState.compile`${res2} engine.truthy(prev = ${data[i]}) ? prev : `;
            res2 = buildState.compile`${res2} prev`;
            return res2;
          }
          return false;
        },
        lazy: true
      },
      "??": {
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        method: (arr, context, above, engine2) => {
          if (!Array.isArray(arr)) throw INVALID_ARGUMENTS;
          let item;
          for (let i = 0; i < arr.length; i++) {
            item = runOptimizedOrFallback(arr[i], engine2, context, above);
            if (item !== null && item !== void 0) return item;
          }
          if (item === void 0) return null;
          return item;
        },
        asyncMethod: async (arr, _1, _2, engine2) => {
          if (!Array.isArray(arr)) throw INVALID_ARGUMENTS;
          let item;
          for (let i = 0; i < arr.length; i++) {
            item = await engine2.run(arr[i], _1, { above: _2 });
            if (item !== null && item !== void 0) return item;
          }
          if (item === void 0) return null;
          return item;
        },
        deterministic: (data, buildState) => isDeterministic(data, buildState.engine, buildState),
        compile: (data, buildState) => {
          if (!getIsOptionalChainingSupported()) return false;
          if (Array.isArray(data) && data.length) {
            return `(${data.map((i, x) => {
              const built = buildString(i, buildState);
              if (Array.isArray(i) || !i || typeof i !== "object" || x === data.length - 1) return built;
              return "(" + built + ")";
            }).join(" ?? ")})`;
          }
          return `(${buildString(data, buildState)}).reduce((a,b) => (a) ?? b, null)`;
        },
        lazy: true
      },
      try: {
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        method: (arr, context, above, engine2) => {
          if (!Array.isArray(arr)) arr = [arr];
          let item;
          let lastError;
          for (let i = 0; i < arr.length; i++) {
            try {
              if (lastError) item = runOptimizedOrFallback(arr[i], engine2, { type: lastError.type || lastError.error || lastError.message || lastError.constructor.name }, [null, context, above]);
              else item = runOptimizedOrFallback(arr[i], engine2, context, above);
              return item;
            } catch (e) {
              if (Number.isNaN(e)) lastError = { message: "NaN" };
              else lastError = e;
            }
          }
          throw lastError;
        },
        asyncMethod: async (arr, _1, _2, engine2) => {
          if (!Array.isArray(arr)) arr = [arr];
          let item;
          let lastError;
          for (let i = 0; i < arr.length; i++) {
            try {
              if (lastError) item = await engine2.run(arr[i], { type: lastError.type || lastError.error || lastError.message || lastError.constructor.name }, { above: [null, _1, _2] });
              else item = await engine2.run(arr[i], _1, { above: _2 });
              return item;
            } catch (e) {
              if (Number.isNaN(e)) lastError = { message: "NaN" };
              else lastError = e;
            }
          }
          throw lastError;
        },
        deterministic: (data, buildState) => {
          return isDeterministic(data[0], buildState.engine, { ...buildState, insideTry: true }) && isDeterministic(data, buildState.engine, { ...buildState, insideIterator: true, insideTry: true });
        },
        lazy: true,
        compile: (data, buildState) => {
          if (!Array.isArray(data) || !data.length) return false;
          let res2;
          try {
            if ("+" in data[0] && data.length > 1) {
              res2 = buildState.compile`((context, above) => { try { const precoerceNumber = a => a; return Number.isNaN(prev = ${data[0]}) ? ${data[1]} : prev  } catch(err) { above = [null, context, above]; context = { type: err.type || err.message || err.toString() }; `;
            } else {
              res2 = buildState.compile`((context, above) => { try { return ${data[0]} } catch(err) { above = [null, context, above]; context = { type: err.type || err.message || err.toString() }; `;
            }
          } catch (err) {
            if (Number.isNaN(err)) err = { type: "NaN" };
            res2 = { [Compiled]: `((context, above) => { { above = [null, context, above]; context = ${JSON.stringify(err)}; ` };
          }
          if (data.length > 1) {
            for (let i = 1; i < data.length; i++) {
              try {
                if (i === data.length - 1) res2 = buildState.compile`${res2} try { return ${data[i]} } catch(err) { throw err; } `;
                else res2 = buildState.compile`${res2} try { return ${data[i]} } catch(err) { context = { type: err.type || err.message || err.toString() }; } `;
              } catch (err) {
                if (Number.isNaN(err)) err = { type: "NaN" };
                if (i === data.length - 1) res2 = buildState.compile`${res2} throw ${{ [Compiled]: JSON.stringify(err) }} `;
                else res2 = buildState.compile`${res2} ${{ [Compiled]: `context = ${JSON.stringify(err)};` }}`;
              }
            }
          } else {
            if (res2[Compiled].includes("err")) res2 = buildState.compile`${res2} throw err;`;
            else res2 = buildState.compile`${res2} throw context;`;
          }
          res2 = buildState.compile`${res2} } })(context, above)`;
          if (res2[Compiled].includes("await")) res2[Compiled] = res2[Compiled].replace("((context", "await (async (context");
          return res2;
        }
      },
      and: {
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        method: (arr, context, above, engine2) => {
          if (!Array.isArray(arr)) throw INVALID_ARGUMENTS;
          if (!arr.length) return null;
          let item;
          for (let i = 0; i < arr.length; i++) {
            item = runOptimizedOrFallback(arr[i], engine2, context, above);
            if (!engine2.truthy(item)) return item;
          }
          return item;
        },
        asyncMethod: async (arr, _1, _2, engine2) => {
          if (!Array.isArray(arr)) throw INVALID_ARGUMENTS;
          if (!arr.length) return null;
          let item;
          for (let i = 0; i < arr.length; i++) {
            item = await engine2.run(arr[i], _1, { above: _2 });
            if (!engine2.truthy(item)) return item;
          }
          return item;
        },
        lazy: true,
        deterministic: (data, buildState) => isDeterministic(data, buildState.engine, buildState),
        compile: (data, buildState) => {
          let res2 = buildState.compile``;
          if (Array.isArray(data)) {
            if (!data.length) return buildState.compile`null`;
            for (let i = 0; i < data.length; i++) res2 = buildState.compile`${res2} !engine.truthy(prev = ${data[i]}) ? prev : `;
            res2 = buildState.compile`${res2} prev`;
            return res2;
          }
          return false;
        }
      },
      substr: ([string, from, end]) => {
        if (end < 0) {
          const result = string.substr(from);
          return result.substr(0, result.length + end);
        }
        return string.substr(from, end);
      },
      length: {
        method: (data, context, above, engine2) => {
          if (!data) throw INVALID_ARGUMENTS;
          const parsed = runOptimizedOrFallback(data, engine2, context, above);
          const i = Array.isArray(data) ? parsed[0] : parsed;
          if (typeof i === "string" || Array.isArray(i)) return i.length;
          if (i && typeof i === "object") return Object.keys(i).length;
          throw INVALID_ARGUMENTS;
        },
        asyncMethod: async (data, context, above, engine2) => {
          if (!data) throw INVALID_ARGUMENTS;
          const parsed = await runOptimizedOrFallback(data, engine2, context, above);
          const i = Array.isArray(data) ? parsed[0] : parsed;
          if (typeof i === "string" || Array.isArray(i)) return i.length;
          if (i && typeof i === "object") return Object.keys(i).length;
          throw INVALID_ARGUMENTS;
        },
        deterministic: (data, buildState) => isDeterministic(data, buildState.engine, buildState),
        lazy: true
      },
      exists: {
        method: (key, context, above, engine2) => {
          const result = defaultMethods.val.method(key, context, above, engine2, Unfound);
          return result !== Unfound;
        },
        deterministic: false
      },
      val: {
        [OriginalImpl]: true,
        [Sync]: true,
        method: (args, context, above, engine2, unFound = null) => {
          if (Array.isArray(args) && args.length === 1 && !Array.isArray(args[0])) args = args[0];
          if (!Array.isArray(args)) {
            if (unFound && !(context && args in context)) return unFound;
            if (context === null || context === void 0) return null;
            const result2 = context[args];
            if (typeof result2 === "undefined") return null;
            return result2;
          }
          let result = context;
          let start = 0;
          if (Array.isArray(args[0]) && args[0].length === 1) {
            start++;
            const climb = +Math.abs(args[0][0]);
            let pos = 0;
            for (let i = 0; i < climb; i++) {
              result = above[pos++];
              if (i === above.length - 1 && Array.isArray(result)) {
                above = result;
                result = result[0];
                pos = 1;
              }
            }
          }
          for (let i = start; i < args.length; i++) {
            if (unFound && !(result && args[i] in result)) return unFound;
            if (result === null || result === void 0) return null;
            result = result[args[i]];
          }
          if (typeof result === "undefined") return unFound;
          if (typeof result === "function" && !engine2.allowFunctions) return unFound;
          return result;
        },
        optimizeUnary: true,
        deterministic: (data, buildState) => {
          if (buildState.insideIterator) {
            if (Array.isArray(data) && Array.isArray(data[0]) && Math.abs(data[0][0]) >= 2) return false;
            return true;
          }
          return false;
        },
        compile: (data, buildState) => {
          function wrapNull(data2) {
            let res2;
            if (!getIsOptionalChainingSupported()) res2 = buildState.compile`(((a) => a === null || a === undefined ? null : a)(${data2}))`;
            else res2 = buildState.compile`(${data2} ?? null)`;
            if (!buildState.engine.allowFunctions) res2 = buildState.compile`(typeof (prev = ${res2}) === 'function' ? null : prev)`;
            return res2;
          }
          if (typeof data === "object" && !Array.isArray(data)) {
            if (isSyncDeep(data, buildState.engine, buildState) && isDeterministic(data, buildState.engine, buildState) && !buildState.engine.disableInline) data = (buildState.engine.fallback || buildState.engine).run(data, buildState.context, { above: buildState.above });
            else return false;
          }
          if (Array.isArray(data) && Array.isArray(data[0])) {
            if (buildState.iteratorCompile && Math.abs(data[0][0] || 0) === 1 && data[1] === "index") return buildState.compile`index`;
            return false;
          }
          if (Array.isArray(data) && data.length === 1) data = data[0];
          if (data === null) return wrapNull(buildState.compile`context`);
          if (!Array.isArray(data)) {
            if (getIsOptionalChainingSupported()) return wrapNull(buildState.compile`context?.[${data}]`);
            return wrapNull(buildState.compile`(context || 0)[${data}]`);
          }
          if (Array.isArray(data)) {
            let res2 = buildState.compile`context`;
            for (let i = 0; i < data.length; i++) {
              if (data[i] === null) continue;
              if (getIsOptionalChainingSupported()) res2 = buildState.compile`${res2}?.[${data[i]}]`;
              else res2 = buildState.compile`(${res2}|| 0)[${data[i]}]`;
            }
            return wrapNull(buildState.compile`(${res2})`);
          }
          return false;
        }
      },
      map: createArrayIterativeMethod("map"),
      some: {
        ...createArrayIterativeMethod("some", true),
        method: (input, context, above, engine2) => {
          if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
          let [selector, mapper] = input;
          selector = runOptimizedOrFallback(selector, engine2, context, above) || [];
          for (let i = 0; i < selector.length; i++) {
            if (engine2.truthy(runOptimizedOrFallback(mapper, engine2, selector[i], [selector, context, above]))) return true;
          }
          return false;
        }
      },
      all: {
        [Sync]: oldAll[Sync],
        method: (args, context, above, engine2) => {
          if (!Array.isArray(args)) throw INVALID_ARGUMENTS;
          const selector = runOptimizedOrFallback(args[0], engine2, context, above) || [];
          if (Array.isArray(selector) && selector.length === 0) return false;
          const mapper = args[1];
          for (let i = 0; i < selector.length; i++) {
            if (!engine2.truthy(runOptimizedOrFallback(mapper, engine2, selector[i], [selector, context, above]))) return false;
          }
          return true;
        },
        asyncMethod: async (args, context, above, engine2) => {
          if (Array.isArray(args)) {
            const first = await engine2.run(args[0], context, above);
            if (Array.isArray(first) && first.length === 0) return false;
          }
          return oldAll.asyncMethod(args, context, above, engine2);
        },
        compile: (data, buildState) => {
          if (!Array.isArray(data)) return false;
          return buildState.compile`Array.isArray(prev = ${data[0]}) && prev.length === 0 ? false : ${oldAll.compile([{ [Compiled]: "prev" }, data[1]], buildState)}`;
        },
        deterministic: oldAll.deterministic,
        lazy: oldAll.lazy
      },
      none: {
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        lazy: true,
        method: (val, context, above, engine2) => !defaultMethods.some.method(val, context, above, engine2),
        asyncMethod: async (val, context, above, engine2) => !await defaultMethods.some.asyncMethod(val, context, above, engine2),
        compile: (data, buildState) => {
          const result = defaultMethods.some.compile(data, buildState);
          return result ? buildState.compile`!(${result})` : false;
        }
      },
      merge: (args) => {
        if (!Array.isArray(args)) return [args];
        const result = [];
        for (let i = 0; i < args.length; i++) {
          if (Array.isArray(args[i])) {
            for (let j = 0; j < args[i].length; j++) {
              result.push(args[i][j]);
            }
          } else result.push(args[i]);
        }
        return result;
      },
      filter: createArrayIterativeMethod("filter", true),
      reduce: {
        deterministic: (data, buildState) => {
          return isDeterministic(data[0], buildState.engine, buildState) && isDeterministic(data[1], buildState.engine, {
            ...buildState,
            insideIterator: true
          });
        },
        compile: (data, buildState) => {
          if (!Array.isArray(data)) throw INVALID_ARGUMENTS;
          const { async } = buildState;
          let [selector, mapper, defaultValue] = data;
          selector = buildString(selector, buildState);
          if (typeof defaultValue !== "undefined") {
            defaultValue = buildString(defaultValue, buildState);
          }
          const mapState = {
            ...buildState,
            extraArguments: "above",
            avoidInlineAsync: true
          };
          mapper = build(mapper, mapState);
          const aboveArray = mapper.aboveDetected ? "[null, context, above]" : "null";
          const verifyAccumulator = buildState.engine.options.maxDepth === Infinity ? "" : "assertAllowedDepth";
          buildState.methods.push(mapper);
          if (async) {
            if (!isSync(mapper) || selector.includes("await")) {
              buildState.asyncDetected = true;
              if (typeof defaultValue !== "undefined") {
                return `await asyncIterators.reduce(${selector} || [], (a,b) => methods[${buildState.methods.length - 1}]({ accumulator: a, current: b }, ${aboveArray}), ${defaultValue}, ${buildState.engine.options.maxDepth})`;
              }
              return `await asyncIterators.reduce(${selector} || [], (a,b) => methods[${buildState.methods.length - 1}]({ accumulator: a, current: b }, ${aboveArray}), undefined, ${buildState.engine.options.maxDepth})`;
            }
          }
          if (typeof defaultValue !== "undefined") {
            return `(${selector} || []).reduce((a,b) => ${verifyAccumulator}(methods[${buildState.methods.length - 1}]({ accumulator: a, current: b }, ${aboveArray})), ${verifyAccumulator}(${defaultValue}))`;
          }
          return `(${selector} || []).reduce((a,b) => ${verifyAccumulator}(methods[${buildState.methods.length - 1}]({ accumulator: a, current: b }, ${aboveArray})))`;
        },
        method: (input, context, above, engine2) => {
          if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
          let [selector, mapper, defaultValue] = input;
          defaultValue = assertAllowedDepth(runOptimizedOrFallback(defaultValue, engine2, context, above), engine2.options.maxDepth);
          selector = runOptimizedOrFallback(selector, engine2, context, above) || [];
          let func = (accumulator, current) => assertAllowedDepth(engine2.run(mapper, { accumulator, current }, { above: [selector, context, above] }), engine2.options.maxDepth);
          if (engine2.optimizedMap.has(mapper) && typeof engine2.optimizedMap.get(mapper) === "function") {
            const optimized = engine2.optimizedMap.get(mapper);
            func = (accumulator, current) => assertAllowedDepth(optimized({ accumulator, current }, [selector, context, above]), engine2.options.maxDepth);
          }
          if (typeof defaultValue === "undefined") return selector.reduce(func);
          return selector.reduce(func, defaultValue);
        },
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        asyncMethod: async (input, context, above, engine2) => {
          if (!Array.isArray(input)) throw INVALID_ARGUMENTS;
          let [selector, mapper, defaultValue] = input;
          defaultValue = assertAllowedDepth(await engine2.run(defaultValue, context, { above }), engine2.options.maxDepth);
          selector = await engine2.run(selector, context, { above }) || [];
          return asyncIterators.reduce(
            selector,
            (accumulator, current) => {
              return engine2.run(
                mapper,
                {
                  accumulator,
                  current
                },
                {
                  above: [selector, context, above]
                }
              );
            },
            defaultValue,
            engine2.options.maxDepth
          );
        },
        lazy: true
      },
      "!": (value, _1, _2, engine2) => Array.isArray(value) ? !engine2.truthy(value[0]) : !engine2.truthy(value),
      "!!": (value, _1, _2, engine2) => Boolean(Array.isArray(value) ? engine2.truthy(value[0]) : engine2.truthy(value)),
      cat: {
        [OriginalImpl]: true,
        [Sync]: true,
        method: (arr) => {
          if (typeof arr === "string") return arr;
          if (!Array.isArray(arr)) return arr.toString();
          let res2 = "";
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] === null || arr[i] === void 0) continue;
            res2 += arr[i];
          }
          return res2;
        },
        deterministic: true,
        optimizeUnary: true,
        compile: (data, buildState) => {
          if (typeof data === "string") return JSON.stringify(data);
          if (typeof data === "number") return '"' + JSON.stringify(data) + '"';
          if (!Array.isArray(data)) return false;
          let res2 = buildState.compile`''`;
          for (let i = 0; i < data.length; i++) res2 = buildState.compile`${res2} + ${data[i]}`;
          return buildState.compile`(${res2})`;
        }
      },
      keys: ([obj]) => typeof obj === "object" ? Object.keys(obj) : [],
      pipe: {
        lazy: true,
        [Sync]: (data, buildState) => isSyncDeep(data, buildState.engine, buildState),
        method: (args, context, above, engine2) => {
          if (!Array.isArray(args)) throw new Error("Data for pipe must be an array");
          let answer = engine2.run(args[0], context, { above: [args, context, above] });
          for (let i = 1; i < args.length; i++) answer = engine2.run(args[i], answer, { above: [args, context, above] });
          return answer;
        },
        asyncMethod: async (args, context, above, engine2) => {
          if (!Array.isArray(args)) throw new Error("Data for pipe must be an array");
          let answer = await engine2.run(args[0], context, { above: [args, context, above] });
          for (let i = 1; i < args.length; i++) answer = await engine2.run(args[i], answer, { above: [args, context, above] });
          return answer;
        },
        compile: (args, buildState) => {
          let res2 = buildState.compile`${args[0]}`;
          for (let i = 1; i < args.length; i++) res2 = buildState.compile`${build(args[i], { ...buildState, extraArguments: "above" })}(${res2}, [null, context, above])`;
          return res2;
        },
        deterministic: (data, buildState) => {
          if (!Array.isArray(data)) return false;
          data = [...data];
          const first = data.shift();
          return isDeterministic(first, buildState.engine, buildState) && isDeterministic(data, buildState.engine, { ...buildState, insideIterator: true });
        }
      },
      eachKey: {
        lazy: true,
        [Sync]: (data, buildState) => isSyncDeep(Object.values(data[Object.keys(data)[0]]), buildState.engine, buildState),
        method: (object, context, above, engine2) => {
          const result = Object.keys(object).reduce((accumulator, key) => {
            const item = object[key];
            Object.defineProperty(accumulator, key, {
              enumerable: true,
              value: engine2.run(item, context, { above })
            });
            return accumulator;
          }, {});
          return result;
        },
        deterministic: (data, buildState) => {
          if (data && typeof data === "object") {
            return Object.values(data).every((i) => {
              return isDeterministic(i, buildState.engine, buildState);
            });
          }
          throw INVALID_ARGUMENTS;
        },
        compile: (data, buildState) => {
          if (data && typeof data === "object") {
            const result = `({ ${Object.keys(data).reduce((accumulator, key) => {
              accumulator.push(
                // @ts-ignore Never[] is not accurate
                `${JSON.stringify(key)}: ${buildString(data[key], buildState)}`
              );
              return accumulator;
            }, []).join(",")} })`;
            return result;
          }
          throw INVALID_ARGUMENTS;
        },
        asyncMethod: async (object, context, above, engine2) => {
          const result = await asyncIterators.reduce(
            Object.keys(object),
            async (accumulator, key) => {
              const item = object[key];
              Object.defineProperty(accumulator, key, {
                enumerable: true,
                value: await engine2.run(item, context, { above })
              });
              return accumulator;
            },
            {},
            Infinity
          );
          return result;
        }
      }
    };
    defaultMethods.every = defaultMethods.all;
    defaultMethods["?:"] = defaultMethods.if;
    Object.keys(defaultMethods).forEach((item) => {
      if (typeof defaultMethods[item] === "function") {
        defaultMethods[item][Sync] = true;
      }
      defaultMethods[item].deterministic = typeof defaultMethods[item].deterministic === "undefined" ? true : defaultMethods[item].deterministic;
    });
    defaultMethods.if.compile = function(data, buildState) {
      if (!Array.isArray(data)) return false;
      if (data.length < 3) return false;
      data = [...data];
      if (data.length % 2 !== 1) data.push(null);
      const onFalse = data.pop();
      let res2 = buildState.compile``;
      while (data.length) {
        const condition = data.shift();
        const onTrue = data.shift();
        res2 = buildState.compile`${res2} engine.truthy(${condition}) ? ${onTrue} : `;
      }
      return buildState.compile`(${res2} ${onFalse})`;
    };
    defaultMethods["+"].compile = function(data, buildState) {
      if (Array.isArray(data)) {
        if (data.length === 0) return "(+0)";
        return `precoerceNumber(${data.map((i) => numberCoercion(i, buildState)).join(" + ")})`;
      }
      if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return `precoerceNumber(+${buildString(data, buildState)})`;
      return buildState.compile`(Array.isArray(prev = ${data}) ? prev.reduce((a,b) => (+a)+(+precoerceNumber(b)), 0) : precoerceNumber(+prev))`;
    };
    defaultMethods["%"].compile = function(data, buildState) {
      if (Array.isArray(data)) {
        if (data.length < 2) throw INVALID_ARGUMENTS;
        return `precoerceNumber(${data.map((i) => numberCoercion(i, buildState)).join(" % ")})`;
      }
      return `assertSize(${buildString(data, buildState)}, 2).reduce((a,b) => (+precoerceNumber(a))%(+precoerceNumber(b)))`;
    };
    defaultMethods.in.compile = function(data, buildState) {
      if (!Array.isArray(data)) return false;
      return buildState.compile`(${data[1]} || []).includes(${data[0]})`;
    };
    defaultMethods["-"].compile = function(data, buildState) {
      if (Array.isArray(data)) {
        if (data.length === 0) throw INVALID_ARGUMENTS;
        return `${data.length === 1 ? "-" : ""}precoerceNumber(${data.map((i) => numberCoercion(i, buildState)).join(" - ")})`;
      }
      if (typeof data === "string" || typeof data === "number") return `(-${buildString(data, buildState)})`;
      return buildState.compile`(Array.isArray(prev = ${data}) ? prev.length === 1 ? -precoerceNumber(prev[0]) : assertSize(prev, 1).reduce((a,b) => (+precoerceNumber(a))-(+precoerceNumber(b))) : -precoerceNumber(+prev))`;
    };
    defaultMethods["/"].compile = function(data, buildState) {
      if (Array.isArray(data)) {
        if (data.length === 0) throw INVALID_ARGUMENTS;
        if (data.length === 1) data = [1, data[0]];
        return `precoerceNumber(${data.map((i, x) => {
          let res2 = numberCoercion(i, buildState);
          if (x && res2 === "+0") precoerceNumber(NaN);
          if (x) res2 = `precoerceNumber(${res2} || NaN)`;
          return res2;
        }).join(" / ")})`;
      }
      return `assertSize(prev = ${buildString(data, buildState)}, 1) && prev.length === 1 ? 1 / precoerceNumber(prev[0] || NaN) : prev.reduce((a,b) => (+precoerceNumber(a))/(+precoerceNumber(b || NaN)))`;
    };
    defaultMethods["*"].compile = function(data, buildState) {
      if (Array.isArray(data)) {
        if (data.length === 0) return "1";
        return `precoerceNumber(${data.map((i) => numberCoercion(i, buildState)).join(" * ")})`;
      }
      return `(${buildString(data, buildState)}).reduce((a,b) => (+precoerceNumber(a))*(+precoerceNumber(b)), 1)`;
    };
    defaultMethods["!"].compile = function(data, buildState) {
      if (Array.isArray(data)) return buildState.compile`(!engine.truthy(${data[0]}))`;
      return buildState.compile`(!engine.truthy(${data}))`;
    };
    defaultMethods.not = defaultMethods["!"];
    defaultMethods["!!"].compile = function(data, buildState) {
      if (Array.isArray(data)) return buildState.compile`(!!engine.truthy(${data[0]}))`;
      return buildState.compile`(!!engine.truthy(${data}))`;
    };
    defaultMethods.none.deterministic = defaultMethods.some.deterministic;
    defaultMethods.throw.deterministic = (data, buildState) => {
      return buildState.insideTry && isDeterministic(data, buildState.engine, buildState);
    };
    defaultMethods["+"].optimizeUnary = defaultMethods["-"].optimizeUnary = defaultMethods["!"].optimizeUnary = defaultMethods["!!"].optimizeUnary = defaultMethods.cat.optimizeUnary = defaultMethods.throw.optimizeUnary = true;
    defaultMethods$1 = {
      ...defaultMethods,
      ...legacyMethods$1
    };
    omitUndefined = function omitUndefined2(obj) {
      Object.keys(obj).forEach((key) => {
        if (obj[key] === void 0) {
          delete obj[key];
        }
      });
      return obj;
    };
    comparisons = {
      "<": (a, b) => a < b,
      "<=": (a, b) => a <= b,
      ">": (a, b) => a > b,
      ">=": (a, b) => a >= b,
      // eslint-disable-next-line eqeqeq
      "==": (a, b) => a == b,
      "===": (a, b) => a === b,
      // eslint-disable-next-line eqeqeq
      "!=": (a, b) => a != b,
      "!==": (a, b) => a !== b
    };
    LogicEngine = class {
      /**
       * Creates a new instance of the Logic Engine.
      *
       * @param {Object} methods An object that stores key-value pairs between the names of the commands & the functions they execute.
       * @param {{ disableInline?: Boolean, disableInterpretedOptimization?: Boolean, permissive?: boolean, maxDepth?: number, maxArrayLength?: number, maxStringLength?: number }} options
       */
      constructor(methods = defaultMethods$1, options = { disableInline: false, disableInterpretedOptimization: false, permissive: false, maxDepth: 0, maxArrayLength: 1 << 15, maxStringLength: 1 << 16 }) {
        this.disableInline = options.disableInline;
        this.disableInterpretedOptimization = options.disableInterpretedOptimization;
        this.methods = { ...methods };
        this.optimizedMap = /* @__PURE__ */ new WeakMap();
        this.missesSinceSeen = 0;
        this.options = { disableInline: options.disableInline, disableInterpretedOptimization: options.disableInterpretedOptimization, maxDepth: options.maxDepth || 0, maxArrayLength: options.maxArrayLength || 1 << 15, maxStringLength: options.maxStringLength || 1 << 16 };
        if (!this.isData) {
          if (!options.permissive) this.isData = () => false;
          else this.isData = (data, key) => !(key in this.methods);
        }
      }
      /**
       * Determines the truthiness of a value.
       * You can override this method to change the way truthiness is determined.
       * @param {*} value
       * @returns
       */
      truthy(value) {
        if (!value) return value;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "object") {
          if (value[Symbol.iterator]) {
            if ("length" in value && value.length === 0) return false;
            if ("size" in value && value.size === 0) return false;
          }
          if (value.constructor.name === "Object") return Object.keys(value).length > 0;
        }
        return value;
      }
      /**
       * An internal method used to parse through the JSON Logic at a lower level.
       * @param {*} logic The logic being executed.
       * @param {*} context The context of the logic being run (input to the function.)
       * @param {*} above The context above (can be used for handlebars-style data traversal.)
       * @returns {{ result: *, func: string }}
       */
      _parse(logic, context, above, func, length) {
        const data = logic[func];
        if (this.isData(logic, func)) return logic;
        if (!this.methods[func] || length > 1) throw { type: "Unknown Operator", key: func };
        if ((func === "var" || func === "val") && this.methods[func][OriginalImpl]) {
          const input = !data || typeof data !== "object" ? data : this.run(data, context, { above });
          return this.methods[func].method(input, context, above, this, null);
        }
        if (typeof this.methods[func] === "function") {
          const input = !data || typeof data !== "object" ? [data] : coerceArray(this.run(data, context, { above }));
          return this.methods[func](input, context, above, this);
        }
        if (typeof this.methods[func] === "object") {
          const { method, lazy } = this.methods[func];
          const parsedData = !lazy ? !data || typeof data !== "object" ? [data] : coerceArray(this.run(data, context, { above })) : data;
          return method(parsedData, context, above, this);
        }
        throw new Error(`Method '${func}' is not set up properly.`);
      }
      /**
       *
       * @param {String} name The name of the method being added.
       * @param {((args: any, context: any, above: any[], engine: LogicEngine) => any) |{ lazy?: Boolean, traverse?: Boolean, method: (args: any, context: any, above: any[], engine: LogicEngine) => any, deterministic?: Function | Boolean }} method
       * @param {{ deterministic?: Boolean, optimizeUnary?: Boolean }} annotations This is used by the compiler to help determine if it can optimize the function being generated.
       */
      addMethod(name, method, { deterministic, optimizeUnary } = {}) {
        if (typeof method === "function") method = { method, lazy: false };
        else method = { ...method, lazy: typeof method.traverse !== "undefined" ? !method.traverse : method.lazy };
        Object.assign(method, omitUndefined({ deterministic, optimizeUnary }));
        this.methods[name] = declareSync(method);
      }
      /**
       * Adds a batch of functions to the engine
       * @param {String} name
       * @param {Object} obj
       * @param {{ deterministic?: Boolean, async?: Boolean, sync?: Boolean }} annotations Not recommended unless you're sure every function from the module will match these annotations.
       */
      addModule(name, obj, annotations) {
        Object.getOwnPropertyNames(obj).forEach((key) => {
          if (typeof obj[key] === "function" || typeof obj[key] === "object") this.addMethod(`${name}${name ? "." : ""}${key}`, obj[key], annotations);
        });
      }
      /**
       * Runs the logic against the data.
       *
       * NOTE: With interpreted optimizations enabled, it will cache the execution plan for the logic for
       * future invocations; if you plan to modify the logic, you should disable this feature, by passing
       * `disableInterpretedOptimization: true` in the constructor.
       *
       * If it detects that a bunch of dynamic objects are being passed in, and it doesn't see the same object,
       * it will disable the interpreted optimization.
       *
       * @param {*} logic The logic to be executed
       * @param {*} data The data being passed in to the logic to be executed against.
       * @param {{ above?: any }} options Options for the invocation
       * @returns {*}
       */
      run(logic, data = {}, options = {}) {
        const { above = [] } = options;
        if (!this.disableInterpretedOptimization && typeof logic === "object" && logic) {
          if (this.missesSinceSeen > 500) {
            this.disableInterpretedOptimization = true;
            this.missesSinceSeen = 0;
          }
          if (!this.optimizedMap.has(logic)) {
            this.optimizedMap.set(logic, optimize$1(logic, this, above));
            this.missesSinceSeen++;
            const grab = this.optimizedMap.get(logic);
            return typeof grab === "function" ? grab(data, above) : grab;
          } else {
            this.missesSinceSeen = 0;
            const grab = this.optimizedMap.get(logic);
            return typeof grab === "function" ? grab(data, above) : grab;
          }
        }
        if (Array.isArray(logic)) {
          const res2 = new Array(logic.length);
          for (let i = 0; i < logic.length; i++) res2[i] = this.run(logic[i], data, { above });
          return res2;
        }
        if (logic && typeof logic === "object") {
          const keys = Object.keys(logic);
          if (keys.length > 0) {
            const func = keys[0];
            return this._parse(logic, data, above, func, keys.length);
          }
        }
        return logic;
      }
      /**
       *
       * @param {*} logic The logic to be built.
       * @param {{ top?: Boolean, above?: any }} options
       * @returns {Function}
       */
      build(logic, options = {}) {
        const { above = [], top = true } = options;
        const constructedFunction = build(logic, { engine: this, above });
        if (top === false && constructedFunction.deterministic) return constructedFunction();
        return constructedFunction;
      }
    };
    AsyncLogicEngine = class {
      /**
       * Creates a new instance of the Logic Engine.
       *
       * "compatible" applies a few patches to make it compatible with the preferences of mainline JSON Logic.
       * The main changes are:
       * - In mainline: "all" will return false if the array is empty; by default, we return true.
       * - In mainline: empty arrays are falsey; in our implementation, they are truthy.
       *
       * @param {Object} methods An object that stores key-value pairs between the names of the commands & the functions they execute.
       * @param {{ disableInline?: Boolean, disableInterpretedOptimization?: boolean, permissive?: boolean, maxDepth?: number, maxArrayLength?: number, maxStringLength?: number }} options
       */
      constructor(methods = defaultMethods$1, options = { disableInline: false, disableInterpretedOptimization: false, permissive: false, maxDepth: 0, maxArrayLength: 1 << 15, maxStringLength: 1 << 16 }) {
        this.methods = { ...methods };
        this.options = { disableInline: options.disableInline, disableInterpretedOptimization: options.disableInterpretedOptimization, maxDepth: options.maxDepth || 0, maxArrayLength: options.maxArrayLength || 1 << 15, maxStringLength: options.maxStringLength || 1 << 16 };
        this.disableInline = options.disableInline;
        this.disableInterpretedOptimization = options.disableInterpretedOptimization;
        this.async = true;
        this.fallback = new LogicEngine(methods, options);
        this.optimizedMap = /* @__PURE__ */ new WeakMap();
        this.missesSinceSeen = 0;
        if (!this.isData) {
          if (!options.permissive) this.isData = () => false;
          else this.isData = (data, key) => !(key in this.methods);
        }
        this.fallback.isData = this.isData;
      }
      /**
       * Determines the truthiness of a value.
       * You can override this method to change the way truthiness is determined.
       * @param {*} value
       * @returns
       */
      truthy(value) {
        if (!value) return value;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "object") {
          if (value[Symbol.iterator]) {
            if ("length" in value && value.length === 0) return false;
            if ("size" in value && value.size === 0) return false;
          }
          if (value.constructor.name === "Object") return Object.keys(value).length > 0;
        }
        return value;
      }
      /**
       * An internal method used to parse through the JSON Logic at a lower level.
       * @param {*} logic The logic being executed.
       * @param {*} context The context of the logic being run (input to the function.)
       * @param {*} above The context above (can be used for handlebars-style data traversal.)
       * @returns {Promise<*>}
       */
      async _parse(logic, context, above, func, length) {
        const data = logic[func];
        if (this.isData(logic, func)) return logic;
        if (!this.methods[func] || length > 1) throw { type: "Unknown Operator", key: func };
        if ((func === "var" || func === "val") && this.methods[func][OriginalImpl]) {
          const input = !data || typeof data !== "object" ? data : this.fallback.run(data, context, { above });
          return this.methods[func].method(input, context, above, this);
        }
        if (typeof this.methods[func] === "function") {
          const input = !data || typeof data !== "object" ? [data] : await this.run(data, context, { above });
          const result = await this.methods[func](coerceArray(input), context, above, this);
          return Array.isArray(result) ? Promise.all(result) : result;
        }
        if (typeof this.methods[func] === "object") {
          const { asyncMethod, method, lazy } = this.methods[func];
          const parsedData = !lazy ? !data || typeof data !== "object" ? [data] : coerceArray(await this.run(data, context, { above })) : data;
          const result = await (asyncMethod || method)(parsedData, context, above, this);
          return Array.isArray(result) ? Promise.all(result) : result;
        }
        throw new Error(`Method '${func}' is not set up properly.`);
      }
      /**
       *
       * @param {String} name The name of the method being added.
       * @param {((args: any, context: any, above: any[], engine: AsyncLogicEngine) => any) | { lazy?: Boolean, traverse?: Boolean, method?: (args: any, context: any, above: any[], engine: AsyncLogicEngine) => any, asyncMethod?: (args: any, context: any, above: any[], engine: AsyncLogicEngine) => Promise<any>, deterministic?: Function | Boolean }} method
       * @param {{ deterministic?: Boolean, async?: Boolean, sync?: Boolean, optimizeUnary?: boolean }} annotations This is used by the compiler to help determine if it can optimize the function being generated.
       */
      addMethod(name, method, { deterministic, async, sync, optimizeUnary } = {}) {
        if (typeof async === "undefined" && typeof sync === "undefined") sync = false;
        if (typeof sync !== "undefined") async = !sync;
        if (typeof async !== "undefined") sync = !async;
        if (typeof method === "function") {
          if (async) method = { asyncMethod: method, lazy: false };
          else method = { method, lazy: false };
        } else method = { ...method, lazy: typeof method.traverse !== "undefined" ? !method.traverse : method.lazy };
        Object.assign(method, omitUndefined({ deterministic, optimizeUnary }));
        this.fallback.addMethod(name, method, { deterministic });
        this.methods[name] = declareSync(method, sync);
      }
      /**
       * Adds a batch of functions to the engine
       * @param {String} name
       * @param {Object} obj
       * @param {{ deterministic?: Boolean, async?: Boolean, sync?: Boolean }} annotations Not recommended unless you're sure every function from the module will match these annotations.
       */
      addModule(name, obj, annotations = {}) {
        Object.getOwnPropertyNames(obj).forEach((key) => {
          if (typeof obj[key] === "function" || typeof obj[key] === "object") this.addMethod(`${name}${name ? "." : ""}${key}`, obj[key], annotations);
        });
      }
      /**
       * Runs the logic against the data.
       *
       * NOTE: With interpreted optimizations enabled, it will cache the execution plan for the logic for
       * future invocations; if you plan to modify the logic, you should disable this feature, by passing
       * `disableInterpretedOptimization: true` in the constructor.
       *
       * If it detects that a bunch of dynamic objects are being passed in, and it doesn't see the same object,
       * it will disable the interpreted optimization.
       *
       * @param {*} logic The logic to be executed
       * @param {*} data The data being passed in to the logic to be executed against.
       * @param {{ above?: any }} options Options for the invocation
       * @returns {Promise}
       */
      async run(logic, data = {}, options = {}) {
        const { above = [] } = options;
        if (!this.disableInterpretedOptimization && typeof logic === "object" && logic) {
          if (this.missesSinceSeen > 500) {
            this.disableInterpretedOptimization = true;
            this.missesSinceSeen = 0;
          }
          if (!this.optimizedMap.has(logic)) {
            this.optimizedMap.set(logic, optimize(logic, this, above));
            this.missesSinceSeen++;
            const grab = this.optimizedMap.get(logic);
            return typeof grab === "function" ? grab(data, above) : grab;
          } else {
            this.missesSinceSeen = 0;
            const grab = this.optimizedMap.get(logic);
            return typeof grab === "function" ? grab(data, above) : grab;
          }
        }
        if (Array.isArray(logic)) {
          const res2 = new Array(logic.length);
          for (let i = 0; i < logic.length; i++) res2[i] = await this.run(logic[i], data, { above });
          return res2;
        }
        if (logic && typeof logic === "object" && Object.keys(logic).length > 0) {
          const keys = Object.keys(logic);
          if (keys.length > 0) {
            const func = keys[0];
            return this._parse(logic, data, above, func, keys.length);
          }
        }
        return logic;
      }
      /**
       *
       * @param {*} logic The logic to be built.
       * @param {{ top?: Boolean, above?: any }} options
       * @returns {Promise<Function>}
       */
      async build(logic, options = {}) {
        const { above = [], top = true } = options;
        this.fallback.truthy = this.truthy;
        this.fallback.allowFunctions = this.allowFunctions;
        const constructedFunction = await buildAsync(logic, { engine: this, above, async: true });
        const result = declareSync((...args) => {
          if (top === true) {
            try {
              const result2 = typeof constructedFunction === "function" ? constructedFunction(...args) : constructedFunction;
              return Promise.resolve(result2);
            } catch (err) {
              return Promise.reject(err);
            }
          }
          return typeof constructedFunction === "function" ? constructedFunction(...args) : constructedFunction;
        }, top !== true && isSync(constructedFunction));
        if (top === false && constructedFunction.deterministic) return result();
        return typeof constructedFunction === "function" || top === true ? result : constructedFunction;
      }
    };
  }
});

// src/runtime/util/access.ts
import { resolve, isAbsolute, sep } from "node:path";
import { realpathSync } from "node:fs";
function isPathAllowed(input) {
  if (allowedRoots === null || configuredRuntimeRoot === null) return null;
  if (typeof input !== "string" || input.length === 0) return null;
  const nominal = isAbsolute(input) ? input : resolve(configuredRuntimeRoot, input);
  let canonical;
  try {
    canonical = realpathSync.native(nominal);
  } catch {
    canonical = nominal;
  }
  for (const root of allowedRoots) {
    if (canonical === root || canonical.startsWith(root + sep)) {
      return canonical;
    }
  }
  return null;
}
function isEnvAllowed(name) {
  if (allowedEnvPatterns === null) return false;
  return allowedEnvPatterns.some((pattern) => pattern.test(name));
}
var allowedRoots, allowedEnvPatterns, configuredRuntimeRoot;
var init_access = __esm({
  "src/runtime/util/access.ts"() {
    "use strict";
    allowedRoots = null;
    allowedEnvPatterns = null;
    configuredRuntimeRoot = null;
  }
});

// src/runtime/util/jsonlogic.ts
import { statSync, accessSync, constants as fsConstants } from "node:fs";
import { dirname, join as pathJoin, resolve as pathResolve, basename, isAbsolute as isAbsolute2 } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch, homedir, tmpdir } from "node:os";
function fileExists([rawPath]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return false;
  try {
    accessSync(canonical, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function fileIsFile([rawPath]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return false;
  try {
    return statSync(canonical).isFile();
  } catch {
    return false;
  }
}
function fileIsDir([rawPath]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return false;
  try {
    return statSync(canonical).isDirectory();
  } catch {
    return false;
  }
}
function fileSize([rawPath]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return null;
  try {
    return statSync(canonical).size;
  } catch {
    return null;
  }
}
function envGet([rawName]) {
  if (typeof rawName !== "string" || rawName.length === 0) return null;
  if (!isEnvAllowed(rawName)) return null;
  const value = process.env[rawName];
  return value === void 0 ? null : value;
}
function envHas([rawName]) {
  if (typeof rawName !== "string" || rawName.length === 0) return false;
  if (!isEnvAllowed(rawName)) return false;
  return Object.prototype.hasOwnProperty.call(process.env, rawName);
}
function pathJoinHelper(parts) {
  if (parts.length === 0) return null;
  const strings = [];
  for (const part of parts) {
    if (typeof part !== "string") return null;
    strings.push(part);
  }
  try {
    return pathJoin(...strings);
  } catch {
    return null;
  }
}
function pathResolveHelper([rawPath]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    if (isAbsolute2(rawPath)) return rawPath;
    return pathResolve(RUNTIME_ROOT, rawPath);
  } catch {
    return null;
  }
}
function pathDirname([rawPath]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    return dirname(rawPath);
  } catch {
    return null;
  }
}
function pathBasename(args) {
  const [rawPath, ext] = args;
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    if (typeof ext === "string") return basename(rawPath, ext);
    return basename(rawPath);
  } catch {
    return null;
  }
}
function osPlatform() {
  return platform();
}
function osArch() {
  return arch();
}
function osHomedir() {
  try {
    return homedir();
  } catch {
    return null;
  }
}
function osTmpdir() {
  try {
    return tmpdir();
  } catch {
    return null;
  }
}
function timeNow() {
  return Date.now();
}
function timeIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var engine, RUNTIME_ROOT;
var init_jsonlogic = __esm({
  "src/runtime/util/jsonlogic.ts"() {
    "use strict";
    init_esm();
    init_access();
    engine = new AsyncLogicEngine();
    RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
    engine.addMethod("file.exists", fileExists);
    engine.addMethod("file.is_file", fileIsFile);
    engine.addMethod("file.is_dir", fileIsDir);
    engine.addMethod("file.size", fileSize);
    engine.addMethod("env.get", envGet);
    engine.addMethod("env.has", envHas);
    engine.addMethod("path.join", pathJoinHelper);
    engine.addMethod("path.resolve", pathResolveHelper);
    engine.addMethod("path.dirname", pathDirname);
    engine.addMethod("path.basename", pathBasename);
    engine.addMethod("os.platform", osPlatform);
    engine.addMethod("os.arch", osArch);
    engine.addMethod("os.homedir", osHomedir);
    engine.addMethod("os.tmpdir", osTmpdir);
    engine.addMethod("time.now", timeNow);
    engine.addMethod("time.iso", timeIso);
  }
});

// src/runtime/handlers/dispatch.ts
var init_dispatch = __esm({
  "src/runtime/handlers/dispatch.ts"() {
    "use strict";
    init_types();
    init_jsonlogic();
  }
});

// src/runtime/util/stringify.ts
var init_stringify = __esm({
  "src/runtime/util/stringify.ts"() {
    "use strict";
  }
});

// src/runtime/handlers/compute.ts
var init_compute = __esm({
  "src/runtime/handlers/compute.ts"() {
    "use strict";
    init_jsonlogic();
    init_stringify();
  }
});

// src/runtime/connections.ts
var init_connections = __esm({
  "src/runtime/connections.ts"() {
    "use strict";
    init_jsonlogic();
    init_stringify();
  }
});

// src/runtime/util/fetch.ts
var MAX_RESPONSE_BYTES;
var init_fetch = __esm({
  "src/runtime/util/fetch.ts"() {
    "use strict";
    init_access();
    init_types();
    MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
  }
});

// src/runtime/handlers/http.ts
var init_http = __esm({
  "src/runtime/handlers/http.ts"() {
    "use strict";
    init_types();
    init_connections();
    init_fetch();
    init_template();
  }
});

// src/runtime/handlers/graphql.ts
var init_graphql = __esm({
  "src/runtime/handlers/graphql.ts"() {
    "use strict";
    init_types();
    init_connections();
    init_fetch();
    init_template();
  }
});

// src/runtime/handlers/index.ts
var init_handlers = __esm({
  "src/runtime/handlers/index.ts"() {
    "use strict";
    init_inline();
    init_exec();
    init_dispatch();
    init_compute();
    init_http();
    init_graphql();
  }
});

// src/runtime/probes.ts
function validateProbes(v) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: probes must be a mapping");
  }
  const raw = v;
  const out = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!NAME_RE.test(name)) {
      throw new Error(
        `config: probes.${name}: probe names must match ${NAME_RE} (alphanumeric + underscore, no leading digit)`
      );
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`config: probes.${name} must be a mapping`);
    }
    out[name] = validateProbeEntry(entry, name);
  }
  return out;
}
function validateProbeEntry(e, name) {
  for (const key of Object.keys(e)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`config: probes.${name}: unknown key "${key}"`);
    }
  }
  const handlerKeys = ["graphql", "http", "exec"].filter((k) => e[k] !== void 0);
  if (handlerKeys.length === 0) {
    throw new Error(
      `config: probes.${name}: must declare exactly one of graphql, http, exec (got none)`
    );
  }
  if (handlerKeys.length > 1) {
    throw new Error(
      `config: probes.${name}: must declare exactly one of graphql, http, exec (got ${handlerKeys.join(", ")})`
    );
  }
  const rawHandler = {};
  if (e["exec"] !== void 0) rawHandler["exec"] = e["exec"];
  else if (e["graphql"] !== void 0) rawHandler["graphql"] = e["graphql"];
  else rawHandler["http"] = e["http"];
  const handler = validateHandlerPublic(rawHandler, `probes.${name}`);
  const out = { handler };
  if (e["map"] !== void 0) {
    out.map = e["map"];
  }
  if (e["timeout_ms"] !== void 0) {
    if (typeof e["timeout_ms"] !== "number" || !Number.isFinite(e["timeout_ms"]) || e["timeout_ms"] <= 0) {
      throw new Error(
        `config: probes.${name}.timeout_ms must be a positive number`
      );
    }
    out.timeout_ms = e["timeout_ms"];
  }
  return out;
}
var KNOWN_KEYS, NAME_RE;
var init_probes = __esm({
  "src/runtime/probes.ts"() {
    "use strict";
    init_config();
    init_handlers();
    init_jsonlogic();
    KNOWN_KEYS = /* @__PURE__ */ new Set([
      "graphql",
      "http",
      "exec",
      "map",
      "timeout_ms"
    ]);
    NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  }
});

// src/runtime/resources.ts
function validateResources(v, validateHandler2) {
  if (v === void 0) return void 0;
  if (!Array.isArray(v)) {
    throw new Error("config: resources must be an array");
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < v.length; i++) {
    out.push(validateResourceEntry(v[i], i, validateHandler2, seen));
  }
  return out;
}
function validateResourceEntry(entry, index, validateHandler2, seen) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: resources[${index}] must be a mapping`);
  }
  const e = entry;
  for (const key of Object.keys(e)) {
    if (!ENTRY_KNOWN.has(key)) {
      throw new Error(`config: resources[${index}]: unknown key "${key}"`);
    }
  }
  const hasUri = typeof e["uri"] === "string" && e["uri"].length > 0;
  const hasTemplate = typeof e["template"] === "string" && e["template"].length > 0;
  if (!hasUri && !hasTemplate) {
    throw new Error(`config: resources[${index}]: exactly one of uri or template is required`);
  }
  if (hasUri && hasTemplate) {
    throw new Error(`config: resources[${index}]: exactly one of uri or template is required`);
  }
  if (hasTemplate && e["watcher"] !== void 0) {
    throw new Error(
      `config: resources[${index}]: template resource cannot carry a watcher (watching a family-of-URIs is unbounded)`
    );
  }
  if (hasUri) {
    const uri = e["uri"];
    try {
      new URL(uri);
    } catch {
      throw new Error(`config: resources[${index}].uri "${uri}" is not a valid URL`);
    }
    if (seen.has(uri)) {
      throw new Error(`config: resources: duplicate uri "${uri}"`);
    }
    seen.add(uri);
  } else {
    const tmpl = e["template"];
    if (seen.has(tmpl)) {
      throw new Error(`config: resources: duplicate template "${tmpl}"`);
    }
    seen.add(tmpl);
  }
  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    throw new Error(`config: resources[${index}].name is required and must be a non-empty string`);
  }
  if (e["description"] !== void 0 && typeof e["description"] !== "string") {
    throw new Error(`config: resources[${index}].description must be a string`);
  }
  if (e["mimeType"] !== void 0 && typeof e["mimeType"] !== "string") {
    throw new Error(`config: resources[${index}].mimeType must be a string`);
  }
  if (!e["handler"] || typeof e["handler"] !== "object") {
    throw new Error(`config: resources[${index}].handler is required and must be a mapping`);
  }
  const handler = validateHandler2(e["handler"], `resources[${index}]`);
  const out = hasUri ? { uri: e["uri"], name: e["name"], handler } : { template: e["template"], name: e["name"], handler };
  if (e["description"] !== void 0) out.description = e["description"];
  if (e["mimeType"] !== void 0) out.mimeType = e["mimeType"];
  if (e["watcher"] !== void 0) {
    out.watcher = validateWatcher(e["watcher"], index);
  }
  return out;
}
function validateWatcher(v, resourceIndex) {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: resources[${resourceIndex}].watcher must be a mapping`);
  }
  const w = v;
  const type = w["type"];
  if (type !== "polling" && type !== "file" && type !== "webhook") {
    throw new Error(
      `config: resources[${resourceIndex}].watcher.type must be one of polling, file, webhook`
    );
  }
  if (type === "polling") {
    for (const key of Object.keys(w)) {
      if (!POLLING_KNOWN.has(key)) {
        throw new Error(`config: resources[${resourceIndex}].watcher polling watcher: unknown key "${key}"`);
      }
    }
    const interval = w["interval_ms"];
    if (interval === void 0) {
      throw new Error(`config: resources[${resourceIndex}].watcher polling watcher requires interval_ms`);
    }
    if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
      throw new Error(`config: resources[${resourceIndex}].watcher.interval_ms must be a positive number`);
    }
    const cd = w["change_detection"];
    if (cd !== void 0 && cd !== "hash" && cd !== "always") {
      throw new Error(`config: resources[${resourceIndex}].watcher.change_detection must be "hash" or "always"`);
    }
    const out2 = { type: "polling", interval_ms: interval };
    if (cd !== void 0) out2.change_detection = cd;
    return out2;
  }
  if (type === "file") {
    for (const key of Object.keys(w)) {
      if (!FILE_KNOWN.has(key)) {
        throw new Error(`config: resources[${resourceIndex}].watcher file watcher: unknown key "${key}"`);
      }
    }
    const path = w["path"];
    if (typeof path !== "string" || path.length === 0) {
      throw new Error(`config: resources[${resourceIndex}].watcher file watcher requires path (non-empty string)`);
    }
    return { type: "file", path };
  }
  for (const key of Object.keys(w)) {
    if (!WEBHOOK_KNOWN.has(key)) {
      throw new Error(`config: resources[${resourceIndex}].watcher webhook watcher: unknown key "${key}"`);
    }
  }
  const port = w["port"];
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`config: resources[${resourceIndex}].watcher webhook watcher requires port (integer 1-65535)`);
  }
  const webhookPath = w["path"];
  if (webhookPath !== void 0 && (typeof webhookPath !== "string" || webhookPath.length === 0)) {
    throw new Error(`config: resources[${resourceIndex}].watcher webhook watcher: path must be a non-empty string`);
  }
  const out = { type: "webhook", port };
  if (typeof webhookPath === "string") out.path = webhookPath;
  return out;
}
var ENTRY_KNOWN, POLLING_KNOWN, FILE_KNOWN, WEBHOOK_KNOWN;
var init_resources = __esm({
  "src/runtime/resources.ts"() {
    "use strict";
    init_handlers();
    init_access();
    ENTRY_KNOWN = /* @__PURE__ */ new Set([
      "uri",
      "template",
      "name",
      "description",
      "mimeType",
      "handler",
      "watcher"
    ]);
    POLLING_KNOWN = /* @__PURE__ */ new Set(["type", "interval_ms", "change_detection"]);
    FILE_KNOWN = /* @__PURE__ */ new Set(["type", "path"]);
    WEBHOOK_KNOWN = /* @__PURE__ */ new Set(["type", "port", "path"]);
  }
});

// src/runtime/prompts.ts
function validatePrompts(v) {
  if (v === void 0) return void 0;
  if (!Array.isArray(v)) {
    throw new Error("config: prompts must be an array");
  }
  const out = [];
  const seenNames = /* @__PURE__ */ new Set();
  for (let i = 0; i < v.length; i++) {
    out.push(validatePromptEntry(v[i], i, seenNames));
  }
  return out;
}
function validatePromptEntry(entry, index, seenNames) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: prompts[${index}] must be a mapping`);
  }
  const e = entry;
  for (const key of Object.keys(e)) {
    if (!PROMPT_KNOWN.has(key)) {
      throw new Error(`config: prompts[${index}]: unknown key "${key}"`);
    }
  }
  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    throw new Error(`config: prompts[${index}].name is required and must be a non-empty string`);
  }
  const name = e["name"];
  if (seenNames.has(name)) {
    throw new Error(`config: prompts: duplicate prompt name "${name}"`);
  }
  seenNames.add(name);
  if (e["description"] !== void 0 && typeof e["description"] !== "string") {
    throw new Error(`config: prompts[${index}].description must be a string`);
  }
  if (typeof e["template"] !== "string" || e["template"].length === 0) {
    throw new Error(`config: prompts[${index}].template is required and must be a non-empty string`);
  }
  const args = e["arguments"] === void 0 ? void 0 : validatePromptArguments(e["arguments"], index);
  const out = { name, template: e["template"] };
  if (e["description"] !== void 0) out.description = e["description"];
  if (args !== void 0) out.arguments = args;
  return out;
}
function validatePromptArguments(v, promptIndex) {
  if (!Array.isArray(v)) {
    throw new Error(`config: prompts[${promptIndex}].arguments must be an array`);
  }
  const out = [];
  const seenArgNames = /* @__PURE__ */ new Set();
  for (let i = 0; i < v.length; i++) {
    out.push(validatePromptArgument(v[i], promptIndex, i, seenArgNames));
  }
  return out;
}
function validatePromptArgument(entry, promptIndex, argIndex, seen) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: prompts[${promptIndex}].arguments[${argIndex}] must be a mapping`);
  }
  const a = entry;
  for (const key of Object.keys(a)) {
    if (!ARG_KNOWN.has(key)) {
      throw new Error(
        `config: prompts[${promptIndex}].arguments[${argIndex}]: unknown key "${key}"`
      );
    }
  }
  if (typeof a["name"] !== "string" || a["name"].length === 0) {
    throw new Error(
      `config: prompts[${promptIndex}].arguments[${argIndex}].name is required and must be a non-empty string`
    );
  }
  const name = a["name"];
  if (seen.has(name)) {
    throw new Error(`config: prompts[${promptIndex}]: duplicate argument name "${name}"`);
  }
  seen.add(name);
  const out = { name };
  if (typeof a["description"] === "string") out.description = a["description"];
  if (a["required"] !== void 0) out.required = a["required"] === true;
  return out;
}
var PROMPT_KNOWN, ARG_KNOWN;
var init_prompts = __esm({
  "src/runtime/prompts.ts"() {
    "use strict";
    init_template();
    PROMPT_KNOWN = /* @__PURE__ */ new Set(["name", "description", "arguments", "template"]);
    ARG_KNOWN = /* @__PURE__ */ new Set(["name", "description", "required"]);
  }
});

// src/runtime/completions.ts
function extractTemplateVars(template) {
  const vars = /* @__PURE__ */ new Set();
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    const raw = m[1].replace(/^[+#./;?&=,!@|]/, "");
    for (const part of raw.split(",")) {
      vars.add(part.trim().replace(/\*$/, ""));
    }
  }
  return vars;
}
function validateCompletions(v, prompts, resources) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions must be a mapping");
  }
  const raw = v;
  const knownTopKeys = /* @__PURE__ */ new Set(["prompts", "resources"]);
  for (const key of Object.keys(raw)) {
    if (!knownTopKeys.has(key)) {
      throw new Error(`config: completions: unknown key "${key}"`);
    }
  }
  const out = {};
  if (raw["prompts"] !== void 0) {
    out.prompts = validateCompletionPrompts(raw["prompts"], prompts);
  }
  if (raw["resources"] !== void 0) {
    out.resources = validateCompletionResources(raw["resources"], resources);
  }
  return out;
}
function validateCompletionPrompts(v, prompts) {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions.prompts must be a mapping");
  }
  const raw = v;
  const out = {};
  for (const [promptName, argMap] of Object.entries(raw)) {
    const prompt = prompts?.find((p) => p.name === promptName);
    if (!prompt) {
      throw new Error(
        `config: completions.prompts.${promptName}: prompt "${promptName}" not found in prompts:`
      );
    }
    if (!argMap || typeof argMap !== "object" || Array.isArray(argMap)) {
      throw new Error(
        `config: completions.prompts.${promptName} must be a mapping of argName -> string[]`
      );
    }
    const argMapRaw = argMap;
    out[promptName] = {};
    for (const [argName, values] of Object.entries(argMapRaw)) {
      const argExists = prompt.arguments?.some((a) => a.name === argName);
      if (!argExists) {
        throw new Error(
          `config: completions.prompts.${promptName}.${argName}: argument "${argName}" not found in prompt "${promptName}"`
        );
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `config: completions.prompts.${promptName}.${argName} must be an array of strings`
        );
      }
      for (const val of values) {
        if (typeof val !== "string") {
          throw new Error(
            `config: completions.prompts.${promptName}.${argName}: all values must be strings`
          );
        }
      }
      out[promptName][argName] = values;
    }
  }
  return out;
}
function validateCompletionResources(v, resources) {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions.resources must be a mapping");
  }
  const raw = v;
  const out = {};
  const templateVarMap = /* @__PURE__ */ new Map();
  if (resources) {
    for (const spec of resources) {
      if (typeof spec.template === "string") {
        templateVarMap.set(spec.template, extractTemplateVars(spec.template));
      }
    }
  }
  for (const [templateString, varMap] of Object.entries(raw)) {
    const knownVars = templateVarMap.get(templateString);
    if (!knownVars) {
      throw new Error(
        `config: completions.resources."${templateString}": template "${templateString}" not found in resources:`
      );
    }
    if (!varMap || typeof varMap !== "object" || Array.isArray(varMap)) {
      throw new Error(
        `config: completions.resources."${templateString}" must be a mapping of varName -> string[]`
      );
    }
    const varMapRaw = varMap;
    out[templateString] = {};
    for (const [varName, values] of Object.entries(varMapRaw)) {
      if (!knownVars.has(varName)) {
        throw new Error(
          `config: completions.resources."${templateString}".${varName}: "${varName}" is not a variable in template "${templateString}"`
        );
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `config: completions.resources."${templateString}".${varName} must be an array of strings`
        );
      }
      for (const val of values) {
        if (typeof val !== "string") {
          throw new Error(
            `config: completions.resources."${templateString}".${varName}: all values must be strings`
          );
        }
      }
      out[templateString][varName] = values;
    }
  }
  return out;
}
var init_completions = __esm({
  "src/runtime/completions.ts"() {
    "use strict";
  }
});

// src/runtime/tasks.ts
function validateTasks(v, validateHandler2) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: tasks must be a mapping");
  }
  const raw = v;
  const out = {};
  for (const [workflowName, workflowEntry] of Object.entries(raw)) {
    out[workflowName] = validateWorkflow(workflowEntry, workflowName, validateHandler2);
  }
  return out;
}
function validateWorkflow(entry, name, validateHandler2) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: tasks.${name} must be a mapping`);
  }
  const w = entry;
  for (const key of Object.keys(w)) {
    if (!WORKFLOW_KNOWN.has(key)) {
      throw new Error(`config: tasks.${name}: unknown key "${key}"`);
    }
  }
  if (typeof w["initial"] !== "string" || w["initial"].length === 0) {
    throw new Error(`config: tasks.${name}.initial is required and must be a non-empty string`);
  }
  const initial = w["initial"];
  if (!w["states"] || typeof w["states"] !== "object" || Array.isArray(w["states"])) {
    throw new Error(`config: tasks.${name}.states is required and must be a mapping`);
  }
  const rawStates = w["states"];
  const stateNames = new Set(Object.keys(rawStates));
  if (!stateNames.has(initial)) {
    throw new Error(
      `config: tasks.${name}.initial "${initial}" is not a declared state`
    );
  }
  const states = {};
  for (const [stateName, stateEntry] of Object.entries(rawStates)) {
    states[stateName] = validateState(
      stateEntry,
      name,
      stateName,
      stateNames,
      validateHandler2
    );
  }
  return { initial, states };
}
function validateState(entry, workflowName, stateName, declaredStateNames, validateHandler2) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: tasks.${workflowName}.states.${stateName} must be a mapping`);
  }
  const s = entry;
  for (const key of Object.keys(s)) {
    if (!STATE_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: unknown key "${key}"`
      );
    }
  }
  const mcpStatusRaw = s["mcpStatus"];
  if (mcpStatusRaw === "cancelled") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "cancelled" is client-initiated only \u2014 set by the SDK when tasks/cancel is called. Authors cannot declare it as a terminal state.`
    );
  }
  if (mcpStatusRaw !== "working" && mcpStatusRaw !== "input_required" && mcpStatusRaw !== "completed" && mcpStatusRaw !== "failed") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.mcpStatus must be one of "working", "input_required", "completed", "failed" (got ${JSON.stringify(mcpStatusRaw)})`
    );
  }
  const mcpStatus = mcpStatusRaw;
  const isTerminal = mcpStatus === "completed" || mcpStatus === "failed";
  const isInputRequired = mcpStatus === "input_required";
  if (!isInputRequired && s["elicitation"] !== void 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: elicitation: is only valid on input_required states (this state has mcpStatus: ${mcpStatus})`
    );
  }
  if (isTerminal) {
    if (!s["result"] || typeof s["result"] !== "object") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state (mcpStatus: ${mcpStatus}) requires a result: { text } block`
      );
    }
    if (s["actions"] !== void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state MUST NOT declare actions:`
      );
    }
    if (s["on"] !== void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state MUST NOT declare on:`
      );
    }
  } else if (isInputRequired) {
    if (s["elicitation"] === void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state requires an elicitation: block`
      );
    }
    if (s["actions"] !== void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state MUST NOT declare actions: (pre-elicitation work belongs in the prior state)`
      );
    }
    if (s["result"] !== void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state MUST NOT declare result: (it is not terminal)`
      );
    }
    if (s["on"] === void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state requires an on: array (transitions after elicitation response)`
      );
    }
  } else {
    if (s["result"] !== void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: non-terminal state (mcpStatus: working) MUST NOT declare result:`
      );
    }
    if (s["on"] === void 0) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: non-terminal state requires an on: array (otherwise the workflow never advances)`
      );
    }
  }
  const out = { mcpStatus };
  if (s["statusMessage"] !== void 0) {
    if (typeof s["statusMessage"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.statusMessage must be a string`
      );
    }
    out.statusMessage = s["statusMessage"];
  }
  if (s["elicitation"] !== void 0) {
    out.elicitation = validateElicitation(s["elicitation"], workflowName, stateName);
  }
  if (s["actions"] !== void 0) {
    if (!Array.isArray(s["actions"])) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.actions must be an array`
      );
    }
    const actions = [];
    for (let i = 0; i < s["actions"].length; i++) {
      actions.push(
        validateHandler2(
          s["actions"][i],
          `tasks.${workflowName}.states.${stateName}.actions[${i}]`
        )
      );
    }
    out.actions = actions;
  }
  if (s["on"] !== void 0) {
    if (!Array.isArray(s["on"])) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on must be an array`
      );
    }
    const transitions = [];
    for (let i = 0; i < s["on"].length; i++) {
      transitions.push(
        validateTransition(
          s["on"][i],
          workflowName,
          stateName,
          i,
          declaredStateNames
        )
      );
    }
    out.on = transitions;
  }
  if (s["result"] !== void 0) {
    const r = s["result"];
    if (typeof r["text"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.result.text must be a string`
      );
    }
    for (const key of Object.keys(r)) {
      if (key !== "text") {
        throw new Error(
          `config: tasks.${workflowName}.states.${stateName}.result: unknown key "${key}" (only "text" is supported in v1)`
        );
      }
    }
    out.result = { text: r["text"] };
  }
  return out;
}
function validateElicitation(entry, workflowName, stateName) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation must be a mapping`
    );
  }
  const e = entry;
  const known = /* @__PURE__ */ new Set(["message", "schema", "required"]);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.elicitation: unknown key "${key}"`
      );
    }
  }
  if (typeof e["message"] !== "string" || e["message"].length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.message is required and must be a non-empty string`
    );
  }
  if (!e["schema"] || typeof e["schema"] !== "object" || Array.isArray(e["schema"])) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema is required and must be a mapping`
    );
  }
  const rawSchema = e["schema"];
  if (Object.keys(rawSchema).length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema must declare at least one field`
    );
  }
  const schema = {};
  for (const [fieldName, fieldEntry] of Object.entries(rawSchema)) {
    schema[fieldName] = validateElicitationField(
      fieldEntry,
      workflowName,
      stateName,
      fieldName
    );
  }
  const out = { message: e["message"], schema };
  if (e["required"] !== void 0) {
    if (!Array.isArray(e["required"]) || !e["required"].every((r) => typeof r === "string")) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.elicitation.required must be an array of strings`
      );
    }
    for (const req of e["required"]) {
      if (!(req in schema)) {
        throw new Error(
          `config: tasks.${workflowName}.states.${stateName}.elicitation.required lists "${req}" but it is not in schema`
        );
      }
    }
    out.required = e["required"];
  }
  return out;
}
function validateElicitationField(entry, workflowName, stateName, fieldName) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema.${fieldName} must be a mapping`
    );
  }
  const f = entry;
  if (!ELICITATION_FIELD_TYPES.has(f["type"])) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema.${fieldName}.type must be one of "string", "boolean", "number", "integer", "array" (got ${JSON.stringify(f["type"])})`
    );
  }
  const out = { type: f["type"] };
  if (typeof f["description"] === "string") out.description = f["description"];
  if (typeof f["title"] === "string") out.title = f["title"];
  if (f["default"] !== void 0) out.default = f["default"];
  if (Array.isArray(f["enum"])) out.enum = f["enum"];
  if (Array.isArray(f["enumNames"])) out.enumNames = f["enumNames"];
  if (Array.isArray(f["oneOf"])) out.oneOf = f["oneOf"];
  if (typeof f["format"] === "string") out.format = f["format"];
  if (typeof f["minLength"] === "number") out.minLength = f["minLength"];
  if (typeof f["maxLength"] === "number") out.maxLength = f["maxLength"];
  if (typeof f["minimum"] === "number") out.minimum = f["minimum"];
  if (typeof f["maximum"] === "number") out.maximum = f["maximum"];
  if (f["items"] !== void 0 && typeof f["items"] === "object") out.items = f["items"];
  if (typeof f["minItems"] === "number") out.minItems = f["minItems"];
  if (typeof f["maxItems"] === "number") out.maxItems = f["maxItems"];
  return out;
}
function validateTransition(entry, workflowName, stateName, index, declaredStateNames) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}] must be a mapping`
    );
  }
  const t = entry;
  for (const key of Object.keys(t)) {
    if (!TRANSITION_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on[${index}]: unknown key "${key}"`
      );
    }
  }
  if (typeof t["target"] !== "string" || t["target"].length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}].target is required and must be a non-empty string`
    );
  }
  const target = t["target"];
  if (!declaredStateNames.has(target)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}].target "${target}" is not a declared state`
    );
  }
  const out = { target };
  if (t["event"] !== void 0) {
    if (typeof t["event"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on[${index}].event must be a string`
      );
    }
    out.event = t["event"];
  }
  if (t["when"] !== void 0) {
    out.when = t["when"];
  }
  return out;
}
var STATE_KNOWN, TRANSITION_KNOWN, WORKFLOW_KNOWN, ELICITATION_FIELD_TYPES;
var init_tasks = __esm({
  "src/runtime/tasks.ts"() {
    "use strict";
    init_jsonlogic();
    init_template();
    STATE_KNOWN = /* @__PURE__ */ new Set([
      "mcpStatus",
      "statusMessage",
      "elicitation",
      "actions",
      "on",
      "result"
    ]);
    TRANSITION_KNOWN = /* @__PURE__ */ new Set(["event", "target", "when"]);
    WORKFLOW_KNOWN = /* @__PURE__ */ new Set(["initial", "states"]);
    ELICITATION_FIELD_TYPES = /* @__PURE__ */ new Set(["string", "boolean", "number", "integer", "array"]);
  }
});

// src/runtime/config.ts
import { readFileSync } from "node:fs";
function parseConfig(yamlText) {
  const raw = (0, import_yaml.parse)(yamlText);
  if (!raw || typeof raw !== "object") {
    throw new Error("config: YAML root must be a mapping");
  }
  const obj = raw;
  for (const key of Object.keys(obj)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      throw new Error(`config: unknown root key "${key}"`);
    }
  }
  if (obj["version"] === void 0) {
    throw new Error(
      `config: version is required (current version is "${CURRENT_VERSION}")`
    );
  }
  const version = String(obj["version"]);
  if (version !== CURRENT_VERSION) {
    throw new Error(
      `config: unsupported version "${version}" (this runtime supports version "${CURRENT_VERSION}")`
    );
  }
  const server = validateServer(obj["server"]);
  const tools = validateTools(obj["tools"]);
  const connections = validateConnections(obj["connections"]);
  const probes = validateProbes(obj["probes"]);
  const resources = validateResources(
    obj["resources"],
    (h, owner) => validateHandlerPublic(h, owner)
  );
  const prompts = validatePrompts(obj["prompts"]);
  const completions = validateCompletions(obj["completions"], prompts, resources);
  const tasks = validateTasks(obj["tasks"], (h, owner) => validateHandlerPublic(h, owner));
  const result = { version, server, tools };
  if (connections !== void 0) result.connections = connections;
  if (probes !== void 0) result.probes = probes;
  if (resources !== void 0) result.resources = resources;
  if (prompts !== void 0) result.prompts = prompts;
  if (completions !== void 0) result.completions = completions;
  if (tasks !== void 0) result.tasks = tasks;
  crossRefTasks(tools, tasks);
  return result;
}
function* findWorkflowRefs(handler) {
  if ("workflow" in handler) {
    yield { ref: handler.workflow.ref, path: "handler.workflow" };
    return;
  }
  if ("dispatch" in handler) {
    for (const [caseName, caseSpec] of Object.entries(handler.dispatch.cases)) {
      for (const inner of findWorkflowRefs(caseSpec.handler)) {
        yield {
          ref: inner.ref,
          path: `handler.dispatch.cases.${caseName}.${inner.path}`
        };
      }
    }
  }
}
function crossRefTasks(tools, tasks) {
  for (const tool of tools) {
    const isTaskTool = tool.execution !== void 0;
    const refs = [...findWorkflowRefs(tool.handler)];
    const hasAnyWorkflowRef = refs.length > 0;
    if (hasAnyWorkflowRef && !isTaskTool) {
      const refList = refs.map((r) => r.path).join(", ");
      throw new Error(
        `config: tools[${tool.name}]: workflow case present (${refList}) requires execution.taskSupport (declare execution: { taskSupport: required } or remove the workflow case)`
      );
    }
    for (const { ref, path } of refs) {
      if (!tasks || !(ref in tasks)) {
        throw new Error(
          `config: tools[${tool.name}].${path}.ref "${ref}" not found in tasks:`
        );
      }
    }
    if (isTaskTool) {
      const outerOk = "workflow" in tool.handler || "dispatch" in tool.handler;
      if (!outerOk) {
        throw new Error(
          `config: tools[${tool.name}]: task tool (execution.taskSupport set) requires the outer handler to be workflow: or dispatch: (got ${Object.keys(tool.handler)[0]})`
        );
      }
    }
  }
}
function validateServer(v) {
  if (!v || typeof v !== "object") {
    throw new Error("config: server block is required");
  }
  const s = v;
  if (typeof s["name"] !== "string" || s["name"].length === 0) {
    throw new Error("config: server.name is required and must be a string");
  }
  if (typeof s["version"] !== "string" || s["version"].length === 0) {
    throw new Error("config: server.version is required and must be a string");
  }
  return {
    name: s["name"],
    version: s["version"],
    description: typeof s["description"] === "string" ? s["description"] : void 0,
    instructions: typeof s["instructions"] === "string" ? s["instructions"] : void 0,
    security: validateSecurity(s["security"])
  };
}
function validateSecurityBlock(v, key) {
  if (!v || typeof v !== "object") {
    throw new Error(`config: security.${key} must be a mapping`);
  }
  const block = v;
  if (block["allow"] === void 0) return {};
  if (!Array.isArray(block["allow"])) {
    throw new Error(`config: security.${key}.allow must be an array of strings`);
  }
  for (const entry of block["allow"]) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`config: security.${key}.allow entries must be non-empty strings`);
    }
  }
  return { allow: block["allow"] };
}
function validateSecurity(v) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object") {
    throw new Error("config: server.security must be a mapping");
  }
  const sec = v;
  const knownKeys = /* @__PURE__ */ new Set(["filesystem", "env", "network"]);
  for (const key of Object.keys(sec)) {
    if (!knownKeys.has(key)) {
      throw new Error(`config: security: unknown key "${key}"`);
    }
  }
  const result = {};
  if (sec["filesystem"] !== void 0) {
    result.filesystem = validateSecurityBlock(sec["filesystem"], "filesystem");
  }
  if (sec["env"] !== void 0) {
    result.env = validateSecurityBlock(sec["env"], "env");
  }
  if (sec["network"] !== void 0) {
    result.network = validateSecurityBlock(sec["network"], "network");
  }
  return result;
}
function validateTools(v) {
  if (v === void 0) return [];
  if (!Array.isArray(v)) {
    throw new Error("config: tools must be an array");
  }
  const seenNames = /* @__PURE__ */ new Set();
  return v.map((entry, i) => {
    const tool = validateTool(entry, i);
    if (seenNames.has(tool.name)) {
      throw new Error(`config: tools: duplicate tool name "${tool.name}"`);
    }
    seenNames.add(tool.name);
    return tool;
  });
}
function validateTool(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`config: tools[${index}] must be a mapping`);
  }
  const t = entry;
  for (const key of Object.keys(t)) {
    if (!TOOL_KNOWN_KEYS.has(key)) {
      throw new Error(`config: tools[${index}]: unknown key "${key}"`);
    }
  }
  if (typeof t["name"] !== "string" || t["name"].length === 0) {
    throw new Error(`config: tools[${index}].name is required`);
  }
  if (typeof t["description"] !== "string") {
    throw new Error(`config: tools[${index}].description is required`);
  }
  if (!t["handler"] || typeof t["handler"] !== "object") {
    throw new Error(`config: tools[${index}].handler is required`);
  }
  const handler = validateHandler(t["handler"], t["name"]);
  const transformRaw = t["transform"];
  const execution = validateExecution(t["execution"], t["name"]);
  const tool = {
    name: t["name"],
    description: t["description"],
    input: validateInput(t["input"], t["name"]),
    handler
  };
  if (transformRaw !== void 0) {
    tool.transform = transformRaw;
  }
  if (execution !== void 0) {
    tool.execution = execution;
  }
  return tool;
}
function validateExecution(v, toolName) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: tools[${toolName}].execution must be a mapping`);
  }
  const e = v;
  const known = /* @__PURE__ */ new Set(["taskSupport"]);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) {
      throw new Error(`config: tools[${toolName}].execution: unknown key "${key}"`);
    }
  }
  if (e["taskSupport"] === void 0) {
    throw new Error(`config: tools[${toolName}].execution.taskSupport is required`);
  }
  const ts = e["taskSupport"];
  if (ts !== "required" && ts !== "optional") {
    throw new Error(
      `config: tools[${toolName}].execution.taskSupport must be one of "required", "optional" (got ${JSON.stringify(ts)})`
    );
  }
  return { taskSupport: ts };
}
function validateInput(v, toolName) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].input must be a mapping`);
  }
  const out = {};
  for (const [field, schema] of Object.entries(v)) {
    if (!schema || typeof schema !== "object") {
      throw new Error(`config: tools[${toolName}].input.${field} must be a mapping`);
    }
    const s = schema;
    if (typeof s["type"] !== "string") {
      throw new Error(`config: tools[${toolName}].input.${field}.type is required`);
    }
    if (!VALID_INPUT_TYPES.has(s["type"])) {
      throw new Error(
        `config: tools[${toolName}].input.${field}.type must be one of ${[...VALID_INPUT_TYPES].join(", ")} (got "${s["type"]}")`
      );
    }
    out[field] = {
      type: s["type"],
      required: s["required"] === true,
      description: typeof s["description"] === "string" ? s["description"] : void 0
    };
  }
  return out;
}
function validateHandler(v, toolName) {
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].handler must be a mapping`);
  }
  const h = v;
  const present = HANDLER_TYPES.filter((k) => h[k] !== void 0);
  if (present.length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler has no supported handler type (${HANDLER_TYPES.join(", ")})`
    );
  }
  if (present.length > 1) {
    throw new Error(
      `config: tools[${toolName}].handler has multiple handler types (${present.join(", ")}); exactly one is required`
    );
  }
  const kind = present[0];
  switch (kind) {
    case "inline": {
      const inline = h["inline"];
      if (!inline || typeof inline !== "object") {
        throw new Error(
          `config: tools[${toolName}].handler.inline must be a mapping`
        );
      }
      if (typeof inline["text"] !== "string") {
        throw new Error(
          `config: tools[${toolName}].handler.inline.text must be a string`
        );
      }
      return { inline: { text: inline["text"] } };
    }
    case "exec": {
      if (typeof h["exec"] === "string") {
        throw new Error(
          `config: tools[${toolName}].handler.exec must be an array of strings, not a string`
        );
      }
      const arr = h["exec"];
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error(
          `config: tools[${toolName}].handler.exec array must not be empty`
        );
      }
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== "string") {
          throw new Error(
            `config: tools[${toolName}].handler.exec[${i}] must be a string`
          );
        }
      }
      const result = { exec: arr };
      if (h["max_output_bytes"] !== void 0) {
        if (typeof h["max_output_bytes"] !== "number" || !Number.isFinite(h["max_output_bytes"]) || h["max_output_bytes"] <= 0) {
          throw new Error(
            `config: tools[${toolName}].handler.max_output_bytes must be a positive number`
          );
        }
        result.max_output_bytes = h["max_output_bytes"];
      }
      return result;
    }
    case "dispatch":
      return validateDispatch(h["dispatch"], toolName);
    case "compute":
      return { compute: h["compute"] };
    case "http":
      return validateHttp(h["http"], toolName);
    case "graphql":
      return validateGraphql(h["graphql"], toolName);
    case "workflow":
      return validateWorkflowHandler(h["workflow"], toolName);
  }
}
function validateHandlerPublic(h, ownerLabel) {
  return validateHandler(h, ownerLabel);
}
function validateDispatch(v, toolName) {
  const d = v;
  if (typeof d["on"] !== "string" || d["on"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.on is required and must be a string`
    );
  }
  if (!d["cases"] || typeof d["cases"] !== "object") {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.cases must be a mapping`
    );
  }
  const rawCases = d["cases"];
  const caseNames = Object.keys(rawCases);
  if (caseNames.length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.cases must declare at least one case`
    );
  }
  const cases = {};
  for (const name of caseNames) {
    const entry = rawCases[name];
    if (!entry || typeof entry !== "object") {
      throw new Error(
        `config: tools[${toolName}].handler.dispatch.cases.${name} must be a mapping`
      );
    }
    const e = entry;
    const subHandler = validateHandler(e["handler"], `${toolName}:${name}`);
    const requires = e["requires"];
    let requiresValue;
    if (requires !== void 0) {
      if (!Array.isArray(requires) || !requires.every((r) => typeof r === "string")) {
        throw new Error(
          `config: tools[${toolName}].handler.dispatch.cases.${name}.requires must be an array of strings`
        );
      }
      requiresValue = requires;
    }
    const when = e["when"];
    const whenValue = when === void 0 ? void 0 : when;
    const caseValue = { handler: subHandler };
    if (requiresValue !== void 0) caseValue.requires = requiresValue;
    if (whenValue !== void 0) caseValue.when = whenValue;
    cases[name] = caseValue;
  }
  return { dispatch: { on: d["on"], cases } };
}
function loadConfigFromFile(path) {
  const text = readFileSync(path, "utf8");
  return parseConfig(text);
}
function validateHttp(v, toolName) {
  const h = v;
  const method = h["method"];
  const validMethods = /* @__PURE__ */ new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  if (typeof method !== "string" || !validMethods.has(method)) {
    throw new Error(
      `config: tools[${toolName}].handler.http.method must be one of GET, POST, PUT, PATCH, DELETE`
    );
  }
  const connection = h["connection"];
  const url = h["url"];
  if (connection === void 0 && url === void 0) {
    throw new Error(
      `config: tools[${toolName}].handler.http requires either connection or url`
    );
  }
  if (connection !== void 0 && typeof connection !== "string") {
    throw new Error(`config: tools[${toolName}].handler.http.connection must be a string`);
  }
  if (url !== void 0 && typeof url !== "string") {
    throw new Error(`config: tools[${toolName}].handler.http.url must be a string`);
  }
  const out = { http: { method } };
  if (connection !== void 0) out.http.connection = connection;
  if (url !== void 0) out.http.url = url;
  for (const key of ["path", "body"]) {
    if (h[key] !== void 0) out.http[key] = h[key];
  }
  if (h["query"] !== void 0) {
    if (!h["query"] || typeof h["query"] !== "object" || Array.isArray(h["query"])) {
      throw new Error(`config: tools[${toolName}].handler.http.query must be a mapping`);
    }
    const q = {};
    for (const [k, v2] of Object.entries(h["query"])) {
      if (typeof v2 !== "string") {
        throw new Error(
          `config: tools[${toolName}].handler.http.query.${k} must be a string`
        );
      }
      q[k] = v2;
    }
    out.http.query = q;
  }
  if (h["headers"] !== void 0) {
    if (!h["headers"] || typeof h["headers"] !== "object" || Array.isArray(h["headers"])) {
      throw new Error(`config: tools[${toolName}].handler.http.headers must be a mapping`);
    }
    const hdrs = {};
    for (const [k, v2] of Object.entries(h["headers"])) {
      if (typeof v2 !== "string") {
        throw new Error(`config: tools[${toolName}].handler.http.headers.${k} must be a string`);
      }
      hdrs[k] = v2;
    }
    out.http.headers = hdrs;
  }
  if (h["response"] !== void 0) {
    if (h["response"] !== "body" && h["response"] !== "envelope") {
      throw new Error(
        `config: tools[${toolName}].handler.http.response must be "body" or "envelope"`
      );
    }
    out.http.response = h["response"];
  }
  if (h["timeout_ms"] !== void 0) {
    if (typeof h["timeout_ms"] !== "number" || !Number.isFinite(h["timeout_ms"]) || h["timeout_ms"] <= 0) {
      throw new Error(`config: tools[${toolName}].handler.http.timeout_ms must be a positive number`);
    }
    out.http.timeout_ms = h["timeout_ms"];
  }
  const known = /* @__PURE__ */ new Set([
    "method",
    "connection",
    "url",
    "path",
    "query",
    "headers",
    "body",
    "response",
    "timeout_ms"
  ]);
  for (const key of Object.keys(h)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.http: unknown key "${key}"`
      );
    }
  }
  return out;
}
function validateConnections(v) {
  if (v === void 0) return void 0;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: connections must be a mapping");
  }
  const raw = v;
  const out = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`config: connections.${name} must be a mapping`);
    }
    const e = entry;
    if (typeof e["url"] !== "string" || e["url"].length === 0) {
      throw new Error(`config: connections.${name}.url must be a non-empty string`);
    }
    const url = e["url"];
    const def = { url };
    if (e["headers"] !== void 0) {
      if (!e["headers"] || typeof e["headers"] !== "object" || Array.isArray(e["headers"])) {
        throw new Error(`config: connections.${name}.headers must be a mapping`);
      }
      const expanded = expandShimInTree(e["headers"]);
      def.headers = expanded;
    }
    if (e["timeout_ms"] !== void 0) {
      if (typeof e["timeout_ms"] !== "number" || !Number.isFinite(e["timeout_ms"]) || e["timeout_ms"] <= 0) {
        throw new Error(`config: connections.${name}.timeout_ms must be a positive number`);
      }
      def.timeout_ms = e["timeout_ms"];
    }
    const known = /* @__PURE__ */ new Set(["url", "headers", "timeout_ms"]);
    for (const key of Object.keys(e)) {
      if (!known.has(key)) {
        throw new Error(`config: connections.${name}: unknown key "${key}"`);
      }
    }
    out[name] = def;
  }
  return out;
}
function validateGraphql(v, toolName) {
  const g = v;
  if (typeof g["connection"] !== "string" || g["connection"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.graphql.connection must be a non-empty string`
    );
  }
  if (typeof g["query"] !== "string" || g["query"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.graphql.query must be a non-empty string`
    );
  }
  const out = {
    graphql: { connection: g["connection"], query: g["query"] }
  };
  if (g["variables"] !== void 0) out.graphql.variables = g["variables"];
  if (g["response"] !== void 0) {
    if (g["response"] !== "body" && g["response"] !== "data" && g["response"] !== "envelope") {
      throw new Error(
        `config: tools[${toolName}].handler.graphql.response must be "body" or "envelope"`
      );
    }
    out.graphql.response = g["response"] === "data" ? "body" : g["response"];
  }
  if (g["timeout_ms"] !== void 0) {
    if (typeof g["timeout_ms"] !== "number" || !Number.isFinite(g["timeout_ms"]) || g["timeout_ms"] <= 0) {
      throw new Error(
        `config: tools[${toolName}].handler.graphql.timeout_ms must be a positive number`
      );
    }
    out.graphql.timeout_ms = g["timeout_ms"];
  }
  const known = /* @__PURE__ */ new Set([
    "connection",
    "query",
    "variables",
    "response",
    "timeout_ms"
  ]);
  for (const key of Object.keys(g)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.graphql: unknown key "${key}"`
      );
    }
  }
  return out;
}
function validateWorkflowHandler(v, toolName) {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: tools[${toolName}].handler.workflow must be a mapping`);
  }
  const w = v;
  const known = /* @__PURE__ */ new Set(["ref", "ttl_ms"]);
  for (const key of Object.keys(w)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.workflow: unknown key "${key}"`
      );
    }
  }
  if (typeof w["ref"] !== "string" || w["ref"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.workflow.ref is required and must be a non-empty string`
    );
  }
  const out = { workflow: { ref: w["ref"] } };
  if (w["ttl_ms"] !== void 0) {
    if (typeof w["ttl_ms"] !== "number" || !Number.isFinite(w["ttl_ms"]) || w["ttl_ms"] <= 0) {
      throw new Error(
        `config: tools[${toolName}].handler.workflow.ttl_ms must be a positive number`
      );
    }
    out.workflow.ttl_ms = w["ttl_ms"];
  }
  return out;
}
var import_yaml, KNOWN_ROOT_KEYS, CURRENT_VERSION, VALID_INPUT_TYPES, TOOL_KNOWN_KEYS, HANDLER_TYPES;
var init_config = __esm({
  "src/runtime/config.ts"() {
    "use strict";
    import_yaml = __toESM(require_dist(), 1);
    init_interpolate();
    init_probes();
    init_resources();
    init_prompts();
    init_completions();
    init_tasks();
    KNOWN_ROOT_KEYS = /* @__PURE__ */ new Set([
      "version",
      "server",
      "tools",
      "connections",
      "probes",
      "resources",
      "prompts",
      "completions",
      "tasks"
    ]);
    CURRENT_VERSION = "1";
    VALID_INPUT_TYPES = /* @__PURE__ */ new Set([
      "string",
      "integer",
      "number",
      "boolean",
      "object",
      "array"
    ]);
    TOOL_KNOWN_KEYS = /* @__PURE__ */ new Set([
      "name",
      "description",
      "input",
      "handler",
      "transform",
      "execution"
    ]);
    HANDLER_TYPES = ["inline", "exec", "dispatch", "compute", "http", "graphql", "workflow"];
  }
});

// src/cli/validate.ts
var validate_exports = {};
__export(validate_exports, {
  run: () => run
});
import { parseArgs } from "node:util";
import { resolve as resolve2 } from "node:path";
async function run(argv) {
  const { positionals: positionals2, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" }
    }
  });
  if (values.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }
  const configArg = positionals2[0];
  if (!configArg) {
    process.stderr.write("jig validate: missing config path\n\n");
    process.stderr.write(USAGE + "\n");
    process.exit(1);
  }
  const configPath = resolve2(configArg);
  try {
    const config = loadConfigFromFile(configPath);
    const toolCount = config.tools.length;
    const resourceCount = config.resources?.length ?? 0;
    const promptCount = config.prompts?.length ?? 0;
    const taskCount = config.tasks ? Object.keys(config.tasks).length : 0;
    const parts = [`${toolCount} tool${toolCount !== 1 ? "s" : ""}`];
    if (resourceCount > 0)
      parts.push(`${resourceCount} resource${resourceCount !== 1 ? "s" : ""}`);
    if (promptCount > 0)
      parts.push(`${promptCount} prompt${promptCount !== 1 ? "s" : ""}`);
    if (taskCount > 0)
      parts.push(`${taskCount} task${taskCount !== 1 ? "s" : ""}`);
    process.stdout.write(
      `ok: ${config.server.name}@${config.server.version} \u2014 ${parts.join(", ")}
`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}
`);
    process.exit(1);
  }
}
var USAGE;
var init_validate = __esm({
  "src/cli/validate.ts"() {
    "use strict";
    init_config();
    USAGE = `jig validate \u2014 check a jig config for errors

Usage: jig validate <jig.yaml>

Parses the YAML, validates all fields, and runs cross-reference
checks (tool\u2192connection, workflow\u2192task, etc.). Exits 0 on success,
1 on validation error.

Options:
  -h, --help    Show this help`;
  }
});

// src/cli/dev.ts
var dev_exports = {};
__export(dev_exports, {
  run: () => run2
});
import { parseArgs as parseArgs2 } from "node:util";
import { resolve as resolve3, dirname as dirname2, join } from "node:path";
import { watch, existsSync } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { spawn } from "node:child_process";
function findRuntimePath() {
  let dir = dirname2(fileURLToPath2(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "src", "runtime", "index.ts");
    if (existsSync(candidate)) return candidate;
    dir = dirname2(dir);
  }
  throw new Error("jig dev: cannot find src/runtime/index.ts");
}
async function run2(argv) {
  const { positionals: positionals2, values } = parseArgs2({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      port: { type: "string" },
      watch: { type: "boolean", default: true, negatable: true }
    }
  });
  if (values.help) {
    process.stdout.write(USAGE2 + "\n");
    return;
  }
  const configArg = positionals2[0] ?? "jig.yaml";
  const configPath = resolve3(configArg);
  const noWatch = values.watch === false;
  let child = null;
  let restarting = false;
  function spawnRuntime() {
    const args = [
      "--experimental-transform-types",
      RUNTIME_PATH,
      "--config",
      configPath
    ];
    if (values.port) {
      args.push("--port", values.port);
    }
    const proc = spawn(process.execPath, args, {
      stdio: ["inherit", "inherit", "inherit"]
    });
    proc.on("exit", (code, signal) => {
      if (!restarting) {
        process.exit(code ?? (signal ? 1 : 0));
      }
    });
    return proc;
  }
  function restart() {
    if (!child) return;
    restarting = true;
    child.kill("SIGTERM");
    child.on("exit", () => {
      restarting = false;
      process.stderr.write("jig dev: reloading...\n");
      child = spawnRuntime();
    });
  }
  child = spawnRuntime();
  if (!noWatch) {
    const watchDir = dirname2(configPath);
    const watcher = watch(watchDir, { recursive: false }, (_event, filename) => {
      if (filename && filename.endsWith(".yaml") || filename?.endsWith(".yml")) {
        restart();
      }
    });
    process.on("SIGINT", () => {
      watcher.close();
      child?.kill("SIGTERM");
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      watcher.close();
      child?.kill("SIGTERM");
      process.exit(0);
    });
  }
}
var RUNTIME_PATH, USAGE2;
var init_dev = __esm({
  "src/cli/dev.ts"() {
    "use strict";
    RUNTIME_PATH = findRuntimePath();
    USAGE2 = `jig dev \u2014 run an MCP server with hot-reload

Usage: jig dev [jig.yaml] [options]

Starts the MCP server from the given config. When the YAML file
changes on disk, the server restarts automatically. Defaults to
jig.yaml in the current directory.

Options:
  --port <n>       Serve over HTTP on this port (default: stdio)
  --no-watch       Disable hot-reload
  -h, --help       Show this help`;
  }
});

// src/cli/build.ts
var build_exports = {};
__export(build_exports, {
  run: () => run3
});
import { parseArgs as parseArgs3 } from "node:util";
import { resolve as resolve4, join as join2, dirname as dirname3 } from "node:path";
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { build as build2 } from "esbuild";
function findRuntimeEntry() {
  let dir = dirname3(fileURLToPath3(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join2(dir, "src", "runtime", "index.ts");
    if (existsSync2(candidate)) return candidate;
    dir = dirname3(dir);
  }
  throw new Error("jig build: cannot find src/runtime/index.ts");
}
async function run3(argv) {
  const { positionals: positionals2, values } = parseArgs3({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      bare: { type: "boolean", default: false },
      port: { type: "string" }
    }
  });
  if (values.help) {
    process.stdout.write(USAGE3 + "\n");
    return;
  }
  if (!values.output) {
    process.stderr.write("jig build: -o / --output is required\n\n");
    process.stderr.write(USAGE3 + "\n");
    process.exit(1);
  }
  const outPath = resolve4(values.output);
  const bare = values.bare === true;
  let yamlContent = null;
  if (!bare) {
    const configArg = positionals2[0];
    if (!configArg) {
      process.stderr.write(
        "jig build: missing config path (use --bare for no embedded YAML)\n\n"
      );
      process.stderr.write(USAGE3 + "\n");
      process.exit(1);
    }
    const configPath = resolve4(configArg);
    try {
      loadConfigFromFile(configPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`jig build: config validation failed: ${message}
`);
      process.exit(1);
    }
    yamlContent = readFileSync2(configPath, "utf8");
  }
  const portValue = values.port !== void 0 ? Number(values.port) : null;
  if (values.port !== void 0) {
    if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
      process.stderr.write(`jig build: invalid port "${values.port}"
`);
      process.exit(1);
    }
  }
  const embeddedConfigPlugin = {
    name: "jig-embedded-config",
    setup(b) {
      b.onResolve({ filter: /\/embedded-config\.ts$/ }, (args) => ({
        path: args.path,
        namespace: "jig-embedded"
      }));
      b.onLoad(
        { filter: /.*/, namespace: "jig-embedded" },
        () => ({
          contents: [
            `export const embeddedYaml = ${yamlContent !== null ? JSON.stringify(yamlContent) : "null"};`,
            `export const embeddedPort = ${portValue !== null ? String(portValue) : "null"};`
          ].join("\n"),
          loader: "ts"
        })
      );
    }
  };
  try {
    const result = await build2({
      entryPoints: [RUNTIME_ENTRY],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      outfile: outPath,
      plugins: [embeddedConfigPlugin],
      banner: {
        js: [
          "#!/usr/bin/env node",
          "import { createRequire as __jig_createRequire } from 'node:module';",
          "const require = __jig_createRequire(import.meta.url);"
        ].join("\n")
      },
      sourcemap: false,
      minify: false,
      treeShaking: true
    });
    if (result.errors.length > 0) {
      process.stderr.write("jig build: esbuild errors:\n");
      for (const e of result.errors) {
        process.stderr.write(`  ${e.text}
`);
      }
      process.exit(1);
    }
    const { chmodSync } = await import("node:fs");
    chmodSync(outPath, 493);
    const stat = readFileSync2(outPath);
    const kb = Math.round(stat.length / 1024);
    process.stdout.write(`ok: ${outPath} (${kb} KB)
`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`jig build: ${message}
`);
    process.exit(1);
  }
}
var RUNTIME_ENTRY, USAGE3;
var init_build = __esm({
  "src/cli/build.ts"() {
    "use strict";
    init_config();
    RUNTIME_ENTRY = findRuntimeEntry();
    USAGE3 = `jig build \u2014 bundle a jig config into a standalone .mjs

Usage: jig build <jig.yaml> -o <output.mjs>
       jig build --bare -o <output.mjs>

Bundles the jig runtime with the author's YAML embedded into a
single-file ESM module. The produced .mjs requires only Node 24+
to run \u2014 no npm install, no node_modules.

Options:
  -o, --output <path>   Output file path (required)
  --bare                Produce a generic engine with no embedded YAML;
                        expects a sibling jig.yaml at runtime
  --port <n>            Bake in HTTP transport on this port (default: stdio)
  -h, --help            Show this help`;
  }
});

// src/cli/new.ts
var new_exports = {};
__export(new_exports, {
  run: () => run4
});
import { parseArgs as parseArgs4 } from "node:util";
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync, readdirSync } from "node:fs";
import { resolve as resolve5, join as join3, dirname as dirname4 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
function findExamplesDir() {
  let dir = dirname4(fileURLToPath4(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join3(dir, "examples");
    if (existsSync3(candidate)) return candidate;
    dir = dirname4(dir);
  }
  throw new Error("jig new: cannot find examples directory");
}
async function run4(argv) {
  const { positionals: positionals2, values } = parseArgs4({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      list: { type: "boolean" }
    }
  });
  if (values.help) {
    process.stdout.write(USAGE4 + "\n");
    return;
  }
  if (values.list) {
    const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort();
    for (const f of files) {
      process.stdout.write(`  ${f}
`);
    }
    return;
  }
  const template = positionals2[0] ?? "minimal";
  const templateFile = join3(EXAMPLES_DIR, `${template}.yaml`);
  if (!existsSync3(templateFile)) {
    process.stderr.write(`jig new: unknown template "${template}"
`);
    process.stderr.write("Run 'jig new --list' to see available templates.\n");
    process.exit(1);
  }
  const outPath = resolve5(values.output ?? "jig.yaml");
  if (existsSync3(outPath)) {
    process.stderr.write(`jig new: ${outPath} already exists
`);
    process.exit(1);
  }
  const content = readFileSync3(templateFile, "utf8");
  writeFileSync(outPath, content);
  process.stdout.write(`ok: created ${outPath} from "${template}" template
`);
}
var EXAMPLES_DIR, USAGE4;
var init_new = __esm({
  "src/cli/new.ts"() {
    "use strict";
    EXAMPLES_DIR = findExamplesDir();
    USAGE4 = `jig new \u2014 scaffold a new jig.yaml

Usage: jig new [template] [options]

Creates a new jig.yaml in the current directory from a template.
Defaults to the "minimal" template.

Templates:
  minimal              Single inline tool (default)
  dispatcher           Dispatcher pattern with exec handlers
  http-and-graphql     HTTP + GraphQL connections
  compute-and-guards   JSONLogic guards + compute handlers
  probes               Startup probes
  resources            Resources with watchers
  prompts-completions  Prompt templates + completions
  tasks                State machine workflows
  tasks-elicitation    Task workflows with elicitation

Options:
  -o, --output <path>  Output file (default: jig.yaml)
  --list               List available templates
  -h, --help           Show this help`;
  }
});

// src/cli/index.ts
import { parseArgs as parseArgs5 } from "node:util";
var USAGE5 = `jig \u2014 YAML-driven MCP server toolkit

Usage: jig <command> [options]

Commands:
  validate <jig.yaml>          Validate a jig config (CI-friendly)
  dev [jig.yaml]               Run MCP server with hot-reload
  build <jig.yaml> -o <out>    Bundle to standalone .mjs
  new [template]               Scaffold a new jig.yaml

Options:
  -h, --help                   Show this help
  -V, --version                Show version

Run 'jig <command> --help' for command-specific help.`;
var flagArgs = process.argv.slice(2);
if (flagArgs.includes("-V") || flagArgs.includes("--version")) {
  let version;
  if (true) {
    version = "1.0.0-alpha.0";
  } else {
    const { createRequire } = await null;
    const req = createRequire(import.meta.url);
    version = req("../../package.json").version;
  }
  process.stdout.write(version + "\n");
  process.exit(0);
}
var { positionals } = parseArgs5({
  allowPositionals: true,
  strict: false,
  args: flagArgs
});
var command = positionals[0];
if (!command || command === "help") {
  process.stdout.write(USAGE5 + "\n");
  process.exit(0);
}
switch (command) {
  case "validate": {
    const { run: run5 } = await Promise.resolve().then(() => (init_validate(), validate_exports));
    await run5(process.argv.slice(3));
    break;
  }
  case "dev": {
    const { run: run5 } = await Promise.resolve().then(() => (init_dev(), dev_exports));
    await run5(process.argv.slice(3));
    break;
  }
  case "build": {
    const { run: run5 } = await Promise.resolve().then(() => (init_build(), build_exports));
    await run5(process.argv.slice(3));
    break;
  }
  case "new": {
    const { run: run5 } = await Promise.resolve().then(() => (init_new(), new_exports));
    await run5(process.argv.slice(3));
    break;
  }
  default:
    process.stderr.write(`jig: unknown command "${command}"

`);
    process.stdout.write(USAGE5 + "\n");
    process.exit(1);
}
