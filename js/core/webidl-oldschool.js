/*global sn, Handlebars */

// Module core/webidl-oldschool
//  Transforms specific markup into the complex old school rendering for API information.

// TODO:
//  - It could be useful to report parsed IDL items as events
//  - don't use generated content in the CSS!

define(
    [
        "text!core/css/webidl-oldschool.css"
    ,    "text!core/templates/webidl/module.html"
    ,    "text!core/templates/webidl/typedef.html"
    ,    "text!core/templates/webidl/implements.html"
    ,    "text!core/templates/webidl/dict-member.html"
    ,    "text!core/templates/webidl/dictionary.html"
    ],
    function (css, idlModuleTmpl, idlTypedefTmpl, idlImplementsTmpl, idlDictMemberTmpl, idlDictionaryTmpl) {
        idlModuleTmpl = Handlebars.compile(idlModuleTmpl);
        idlTypedefTmpl = Handlebars.compile(idlTypedefTmpl);
        idlImplementsTmpl = Handlebars.compile(idlImplementsTmpl);
        idlDictMemberTmpl = Handlebars.compile(idlDictMemberTmpl);
        idlDictionaryTmpl = Handlebars.compile(idlDictionaryTmpl);
        var WebIDLProcessor = function (cfg) {
                this.parent = { type: "module", id: "outermost", children: [] };
                if (!cfg) cfg = {};
                for (var k in cfg) if (cfg.hasOwnProperty(k)) this[k] = cfg[k];

                Handlebars.registerHelper("extAttr", function (obj, indent, nl) {
                    var ret = "";
                    if (obj.extendedAttributes) ret += idn(indent) + "[<span class='extAttr'>" + obj.extendedAttributes + "</span>]" + (nl ? "\n" : "");
                    return new Handlebars.SafeString(ret);
                });
                Handlebars.registerHelper("idn", function (indent) {
                    return new Handlebars.SafeString(idn(indent));
                });
                Handlebars.registerHelper("asWebIDL", function (proc, obj, indent) {
                    return new Handlebars.SafeString(proc.writeAsWebIDL(obj, indent));
                });
                Handlebars.registerHelper("datatype", function (text) {
                    return new Handlebars.SafeString(datatype(text));
                });
                Handlebars.registerHelper("pads", function (num) {
                    return new Handlebars.SafeString(pads(num));
                });
                Handlebars.registerHelper("superclasses", function (obj) {
                    if (!obj.superclasses || !obj.superclasses.length) return "";
                    var str = " : " +
                              obj.superclasses.map(function (it) {
                                                    return "<span class='idlSuperclass'><a>" + it + "</a></span>";
                                                  }).join(", ")
                    ;
                    return new Handlebars.SafeString(str);
                });
            }
        ,   idn = function (lvl) {
                var str = "";
                for (var i = 0; i < lvl; i++) str += "    ";
                return str;
            }
        ,   norm = function (str) {
                return str.replace(/^\s+/, "").replace(/\s+$/, "").split(/\s+/).join(" ");
            }
        ,   sanitiseID = function (id) {
                id = id.split(/[^\-.0-9a-zA-Z_]/).join("-");
                id = id.replace(/^\-+/g, "");
                id = id.replace(/\-+$/, "");
                if (id.length > 0 && /^[^a-z]/.test(id)) id = "x" + id;
                if (id.length === 0) id = "generatedID";
                return id;
            }
        ,   arrsq = function (obj) {
                var str = "";
                for (var i = 0, n = obj.arrayCount; i < n; i++) str += "[]";
                return str;
            }
        ,   datatype = function (text) {
                if ($.isArray(text)) {
                    var arr = [];
                    for (var i = 0, n = text.length; i < n; i++) arr.push(datatype(text[i]));
                    return "(" + arr.join(" or ") + ")";
                }
                else {
                    var matched = /^sequence<(.+)>$/.exec(text);
                    if (matched) return "sequence&lt;<a>" + matched[1] + "</a>&gt;";
                    else return "<a>" + text + "</a>";
                }
            }
        ,   pads = function (num) {
                var str = "";
                for (var i = 0; i < num; i++) str += " ";
                return str;
            }
        ;
        WebIDLProcessor.prototype = {
            setID:  function (obj, match) {
                obj.id = match;
                obj.refId = obj.id.replace(/[^a-zA-Z_\-]/g, "");
            }
        ,   nullable:   function (obj, type) {
                obj.nullable = false;
                if (/\?$/.test(type)) {
                    type = type.replace(/\?$/, "");
                    obj.nullable = true;
                }
                return type;
            }
        ,   array:   function (obj, type) {
                obj.array = false;
                if (/\[\]$/.test(type)) {
                    obj.arrayCount = 0;
                    type = type.replace(/(?:\[\])/g, function () {
                        obj.arrayCount++;
                        return "";
                    });
                    obj.array = true;
                }
                return type;
            }
        ,   params: function (prm, $dd, obj) {
                var p = {};
                prm = this.parseExtendedAttributes(prm, p);
                // either up to end of string, or up to ,
                var re = /^\s*(?:in\s+)?([^,]+)\s+\b([^,\s]+)\s*(?:,)?\s*/;
                var match = re.exec(prm);
                if (match) {
                    prm = prm.replace(re, "");
                    var type = match[1];
                    this.parseDatatype(p, type);
                    this.setID(p, match[2]);
                    if ($dd) p.description = $dd.contents();
                    obj.params.push(p);
                }
                else {
                    this.msg.pub("error", "Expected parameter list, got: " + prm);
                    return false;
                }
                return prm;
            }
        ,   optional:   function (p) {
                if (p.isUnionType) {
                    p.optional = false;
                    return false;
                }
                else {
                    var pkw = p.datatype.split(/\s+/)
                    ,   idx = pkw.indexOf("optional")
                    ,   isOptional = false;
                    if (idx > -1) {
                        isOptional = true;
                        pkw.splice(idx, 1);
                        p.datatype = pkw.join(" ");
                    }
                    p.optional = isOptional;
                    return isOptional;
                }
            }
            
            
        ,   definition:    function ($idl) {
                var def = { children: [] }
                ,   str = $idl.attr("title")
                ,   id = $idl.attr("id");
                str = this.parseExtendedAttributes(str, def);
                if      (str.indexOf("interface") === 0 ||
                         str.indexOf("partial") === 0 ||
                         /^callback\s+interface\b/.test(str))   this.processInterface(def, str, $idl);
                else if (str.indexOf("exception") === 0)        this.exception(def, str, $idl);
                else if (str.indexOf("dictionary") === 0)       this.dictionary(def, str, $idl);
                else if (str.indexOf("callback") === 0)         this.callback(def, str, $idl);
                else if (str.indexOf("enum") === 0)             this.processEnum(def, str, $idl);
                else if (str.indexOf("typedef") === 0)          this.typedef(def, str, $idl);
                else if (/\bimplements\b/.test(str))            this.processImplements(def, str, $idl);
                else    this.msg.pub("error", "Expected definition, got: " + str);
                this.parent.children.push(def);
                this.processMembers(def, $idl);
                if (id) def.htmlID = id;
                return def;
            },

            processInterface:  function (obj, str, $idl) {
                obj.type = "interface";
                var match = /^\s*(?:(partial|callback)\s+)?interface\s+([A-Za-z][A-Za-z0-9]*)(?:\s+:\s*([^{]+)\s*)?/.exec(str);
                if (match) {
                    obj.partial = !!match[1] && match[1] === "partial";
                    obj.callback = !!match[1] && match[1] === "callback";
                    this.setID(obj, match[2]);
                    if ($idl.attr('data-merge')) obj.merge = $idl.attr('data-merge').split(' ');
                    if (match[3]) obj.superclasses = match[3].split(/\s*,\s*/);
                }
                else this.msg.pub("error", "Expected interface, got: " + str);
                return obj;
            },

            dictionary:  function (obj, str, $idl) {
                return this.excDic("dictionary", obj, str, $idl);
            },

            exception:  function (obj, str, $idl) {
                return this.excDic("exception", obj, str, $idl);
            },

            excDic:  function (type, obj, str, $idl) {
                obj.type = type;
                var re = new RegExp("^\\s*" + type + "\\s+([A-Za-z][A-Za-z0-9]*)(?:\\s+:\\s*([^{]+)\\s*)?\\s*")
                ,   match = re.exec(str);
                if (match) {
                    this.setID(obj, match[1]);
                    if (match[2]) obj.superclasses = match[2].split(/\s*,\s*/);
                }
                else this.msg.pub("error", "Expected " + type + ", got: " + str);
                return obj;
            },

            callback:  function (obj, str, $idl) {
                obj.type = "callback";
                var match = /^\s*callback\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*\b(.*?)\s*$/.exec(str);
                if (match) {
                    this.setID(obj, match[1]);
                    var type = match[2];
                    type = this.nullable(obj, type);
                    type = this.array(obj, type);
                    obj.datatype = type;
                }
                else this.msg.pub("error", "Expected callback, got: " + str);
                return obj;
            },

            processEnum:  function (obj, str, $idl) {
                obj.type = "enum";
                var match = /^\s*enum\s+([A-Za-z][A-Za-z0-9]*)\s*$/.exec(str);
                if (match) this.setID(obj, match[1]);
                else this.msg.pub("error", "Expected enum, got: " + str);
                return obj;
            },

            typedef:    function (obj, str, $idl) {
                obj.type = "typedef";
                str = str.replace(/^\s*typedef\s+/, "");
                str = this.parseExtendedAttributes(str, obj);
                var match = /^(.+)\s+(\S+)\s*$/.exec(str);
                if (match) {
                    var type = match[1];
                    type = this.nullable(obj, type);
                    type = this.array(obj, type);
                    obj.datatype = type;
                    this.setID(obj, match[2]);
                    obj.description = $idl.contents();
                }
                else this.msg.pub("error", "Expected typedef, got: " + str);
                return obj;
            },

            processImplements: function (obj, str, $idl) {
                obj.type = "implements";
                var match = /^\s*(.+?)\s+implements\s+(.+)\s*$/.exec(str);
                if (match) {
                    this.setID(obj, match[1]);
                    obj.datatype = match[2];
                    obj.description = $idl.contents();
                }
                else this.msg.pub("error", "Expected implements, got: " + str);
                return obj;
            },

            processMembers:    function (obj, $el) {
                var exParent = this.parent
                ,   self = this;
                this.parent = obj;
                $el.find("> dt").each(function () {
                    var $dt = $(this)
                    ,   $dd = $dt.next()
                    ,   t = obj.type
                    ,   mem
                    ;
                    if      (t === "exception")     mem = self.exceptionMember($dt, $dd);
                    else if (t === "dictionary")    mem = self.dictionaryMember($dt, $dd);
                    else if (t === "callback")      mem = self.callbackMember($dt, $dd);
                    else if (t === "enum")          mem = self.processEnumMember($dt, $dd);
                    else                            mem = self.interfaceMember($dt, $dd);
                    obj.children.push(mem);
                });
                this.parent = exParent;
            },

            parseConst:    function (obj, str) {
                // CONST
                var match = /^\s*const\s+\b([^=]+\??)\s+([^=\s]+)\s*=\s*(.*)$/.exec(str);
                if (match) {
                    obj.type = "constant";
                    var type = match[1];
                    type = this.nullable(obj, type);
                    obj.datatype = type;
                    this.setID(obj, match[2]);
                    obj.value = match[3];
                    return true;
                }
                return false;
            },

            exceptionMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);
                
                // CONST
                if (this.parseConst(obj, str)) return obj;

                // FIELD
                var match = /^\s*(.*?)\s+(\S+)\s*$/.exec(str);
                if (match) {
                    obj.type = "field";
                    var type = match[1];
                    type = this.nullable(obj, type);
                    type = this.array(obj, type);
                    obj.datatype = type;
                    this.setID(obj, match[2]);
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected exception member, got: " + str);
            },

            dictionaryMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // MEMBER
                var match = /^\s*([^=]+\??)\s+([^=\s]+)(?:\s*=\s*(.*))?$/.exec(str);
                if (match) {
                    obj.type = "member";
                    var type = match[1];
                    obj.defaultValue = match[3];
                    this.setID(obj, match[2]);
                    type = this.nullable(obj, type);
                    type = this.array(obj, type);
                    obj.datatype = type;
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected dictionary member, got: " + str);
            },

            callbackMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // MEMBER
                var match = /^\s*\b(.*?)\s+([A-Za-z][A-Za-z0-9]*)\s*$/.exec(str);
                if (match) {
                    obj.type = "member";
                    var type = match[1];
                    this.setID(obj, match[2]);
                    obj.defaultValue = match[3];
                    type = this.nullable(obj, type);
                    type = this.array(obj, type);
                    obj.datatype = type;
                    this.optional(obj);
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected callback member, got: " + str);
            },

            processEnumMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // MEMBER
                obj.type = "member";
                this.setID(obj, str);
                return obj;
            },

            interfaceMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text())
                ,   $extPrm = $dd.find("dl.parameters").first()
                ;
                obj.description = $dd.contents().not("dl.parameters");
                str = this.parseExtendedAttributes(str, obj);
                var match;

                // ATTRIBUTE
                match = /^\s*(?:(readonly)\s+)?attribute\s+\b(.*?)\s+(\S+)\s*$/.exec(str);
                if (match) {
                    obj.type = "attribute";
                    obj.readonly = (match[1] === "readonly");
                    var type = match[2];
                    type = this.nullable(obj, type);
                    type = this.array(obj, type);
                    obj.datatype = type;
                    this.setID(obj, match[3]);
                    return obj;
                }

                // CONST
                if (this.parseConst(obj, str)) return obj;

                // METHOD
                match = /^\s*(.*?)\s+\b(\S+)\s*\(\s*(.*)\s*\)\s*$/.exec(str);
                if (match) {
                    obj.type = "method";
                    var type = match[1]
                    ,   prm = match[3];
                    this.parseDatatype(obj, type);
                    this.setID(obj, match[2]);
                    obj.params = [];

                    if ($extPrm.length) {
                        $extPrm.remove();
                        var self = this;
                        $extPrm.find("> dt").each(function (i) {
                            return self.params($(this).text(), $(this).next(), obj);
                        });
                    }
                    else {
                        while (prm.length) {
                            prm = this.params(prm, null, obj);
                            if (prm === false) break;
                        }
                    }

                    // apply optional
                    var seenOptional = false;
                    for (var i = 0; i < obj.params.length; i++) {
                        if (seenOptional) {
                            obj.params[i].optional = true;
                        }
                        else {
                            seenOptional = this.optional(obj.params[i]);
                        }
                    }
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected interface member, got: " + str);
            },
            
            parseDatatype:  function (obj, type) {
                type = this.nullable(obj, type);
                type = this.array(obj, type);
                obj.variadic = false;
                if (/\.\.\./.test(type)) {
                    type = type.replace(/\.\.\./, "");
                    obj.variadic = true;
                }
                if (type.indexOf("(") === 0) {
                    type = type.replace("(", "").replace(")", "");
                    obj.datatype = type.split(/\s+or\s+/);
                    obj.isUnionType = true;
                }
                else {
                    obj.datatype = type;
                }
            },
            
            parseExtendedAttributes:    function (str, obj) {
                return str.replace(/^\s*\[([^\]]+)\]\s*/, function (x, m1) { obj.extendedAttributes = m1; return ""; });
            },

            makeMarkup:    function (id) {
                var $df = $("<div></div>");
                var attr = { "class": "idl" };
                if (id) attr.id = id;
                var $pre = $("<pre></pre>").attr(attr);
                $pre.html(this.writeAsWebIDL(this.parent, -1));
                $df.append($pre);
                $df.append(this.writeAsHTML(this.parent));
                return $df.children();
            },

            writeAsHTML:    function (obj) {
                if (obj.type == "module") {
                    if (obj.id == "outermost") {
                        if (obj.children.length > 1) this.msg.pub("error", "We currently only support one structural level per IDL fragment");
                        return this.writeAsHTML(obj.children[0]);
                    }
                    else {
                        this.msg.pub("warn", "No HTML can be generated for module definitions.");
                        return $("<span></span>");
                    }
                }
                else if (obj.type == "typedef") {
                    var cnt;
                    if (obj.description && obj.description.text()) cnt = [obj.description];
                    else {
                        // yuck -- should use a single model...
                        var tdt = sn.element("span", { "class": "idlTypedefType" }, null);
                        tdt.innerHTML = datatype(obj.datatype);
                        cnt = [ sn.text("Throughout this specification, the identifier "),
                                sn.element("span", { "class": "idlTypedefID" }, null, obj.id),
                                sn.text(" is used to refer to the "),
                                sn.text(obj.array ? (obj.arrayCount > 1 ? obj.arrayCount + "-" : "") + "array of " : ""),
                                tdt,
                                sn.text(obj.nullable ? " (nullable)" : ""),
                                sn.text(" type.")];
                    }
                    return sn.element("div", { "class": "idlTypedefDesc" }, null, cnt);
                }
                else if (obj.type == "implements") {
                    var cnt;
                    if (obj.description && obj.description.text()) cnt = [obj.description];
                    else {
                        cnt = [ sn.text("All instances of the "),
                                sn.element("code", {}, null, [sn.element("a", {}, null, obj.id)]),
                                sn.text(" type are defined to also implement the "),
                                sn.element("a", {}, null, obj.datatype),
                                sn.text(" interface.")];
                        cnt = [sn.element("p", {}, null, cnt)];
                    }
                    return sn.element("div", { "class": "idlImplementsDesc" }, null, cnt);
                }

                else if (obj.type == "exception") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var types = ["field", "constant"];
                    var filterFunc = function (it) { return it.type === type; }
                    ,   sortFunc = function (a, b) {
                            if (a.id < b.id) return -1;
                            if (a.id > b.id) return 1;
                            return 0;
                    }
                    ;
                    for (var i = 0; i < types.length; i++) {
                        var type = types[i];
                        var things = obj.children.filter(filterFunc);
                        if (things.length === 0) continue;
                        if (!this.noIDLSorting) {
                            things.sort(sortFunc);
                        }

                        var sec = sn.element("section", {}, df);
                        var secTitle = type;
                        secTitle = secTitle.substr(0, 1).toUpperCase() + secTitle.substr(1) + "s";
                        sn.element("h2", {}, sec, secTitle);
                        var dl = sn.element("dl", { "class": type + "s" }, sec);
                        for (var j = 0; j < things.length; j++) {
                            var it = things[j];
                            var dt = sn.element("dt", { id: curLnk + it.refId }, dl);
                            sn.element("code", {}, dt, it.id);
                            var desc = sn.element("dd", {}, dl, [it.description]);
                            if (type == "field") {
                                sn.text(" of type ", dt);
                                if (it.array) {
                                    for (var k = 0, n = it.arrayCount; k < n; k++) sn.text("array of ", dt);
                                }
                                var span = sn.element("span", { "class": "idlFieldType" }, dt);
                                var matched = /^sequence<(.+)>$/.exec(it.datatype);
                                if (matched) {
                                    sn.text("sequence<", span);
                                    sn.element("a", {}, span, matched[1]);
                                    sn.text(">", span);
                                }
                                else {
                                    sn.element("a", {}, span, it.datatype);
                                }
                                if (it.nullable) sn.text(", nullable", dt);
                            }
                            else if (type == "constant") {
                                sn.text(" of type ", dt);
                                sn.element("span", { "class": "idlConstType" }, dt, [sn.element("a", {}, null, it.datatype)]);
                                if (it.nullable) sn.text(", nullable", dt);
                            }
                        }
                    }
                    return df;
                }

                else if (obj.type == "dictionary") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var things = obj.children;
                    var cnt;
                    if (things.length === 0) return df;
                    if (!this.noIDLSorting) {
                        things.sort(function (a, b) {
                            if (a.id < b.id) return -1;
                            if (a.id > b.id) return 1;
                              return 0;
                        });
                    }

                    var sec = sn.element("section", {}, df);
                    cnt = [sn.text("Dictionary "),
                           sn.element("a", { "class": "idlType" }, null, obj.id),
                           sn.text(" Members")];
                    sn.element("h2", {}, sec, cnt);
                    var dl = sn.element("dl", { "class": "dictionary-members" }, sec);
                    for (var j = 0; j < things.length; j++) {
                        var it = things[j];
                        var dt = sn.element("dt", { id: curLnk + it.refId }, dl);
                        sn.element("code", {}, dt, it.id);
                        var desc = sn.element("dd", {}, dl, [it.description]);
                        sn.text(" of type ", dt);
                        if (it.array) {
                            for (var i = 0, n = it.arrayCount; i < n; i++) sn.text("array of ", dt);
                        }
                        var span = sn.element("span", { "class": "idlMemberType" }, dt);
                        var matched = /^sequence<(.+)>$/.exec(it.datatype);
                        if (matched) {
                            sn.text("sequence<", span);
                            sn.element("a", {}, span, matched[1]);
                            sn.text(">", span);
                        }
                        else {
                            sn.element("a", {}, span, it.datatype);
                        }
                        if (it.nullable) sn.text(", nullable", dt);
                        if (it.defaultValue) {
                            sn.text(", defaulting to ", dt);
                            sn.element("code", {}, dt, [sn.text(it.defaultValue)]);
                        }
                    }
                    return df;
                }

                else if (obj.type == "callback") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var things = obj.children;
                    var cnt;
                    if (things.length === 0) return df;

                    var sec = sn.element("section", {}, df);
                    cnt = [sn.text("Callback "),
                           sn.element("a", { "class": "idlType" }, null, obj.id),
                           sn.text(" Parameters")];
                    sn.element("h2", {}, sec, cnt);
                    var dl = sn.element("dl", { "class": "callback-members" }, sec);
                    for (var j = 0; j < things.length; j++) {
                        var it = things[j];
                        var dt = sn.element("dt", { id: curLnk + it.refId }, dl);
                        sn.element("code", {}, dt, it.id);
                        var desc = sn.element("dd", {}, dl, [it.description]);
                        sn.text(" of type ", dt);
                        if (it.array) {
                            for (var i = 0, n = it.arrayCount; i < n; i++) sn.text("array of ", dt);
                        }
                        var span = sn.element("span", { "class": "idlMemberType" }, dt);
                        var matched = /^sequence<(.+)>$/.exec(it.datatype);
                        if (matched) {
                            sn.text("sequence<", span);
                            sn.element("a", {}, span, matched[1]);
                            sn.text(">", span);
                        }
                        else {
                            sn.element("a", {}, span, it.datatype);
                        }
                        if (it.nullable) sn.text(", nullable", dt);
                        if (it.defaultValue) {
                            sn.text(", defaulting to ", dt);
                            sn.element("code", {}, dt, [sn.text(it.defaultValue)]);
                        }
                    }
                    return df;
                }

                else if (obj.type == "enum") {
                    var df = sn.documentFragment();
                    var things = obj.children;
                    if (things.length === 0) return df;

                    var sec = sn.element("table", { "class": "simple" }, df);
                    sn.element("tr", {}, sec, [sn.element("th", { colspan: 2 }, null, [sn.text("Enumeration description")])]);
                    for (var j = 0; j < things.length; j++) {
                        var it = things[j];
                        var tr = sn.element("tr", {}, sec)
                        ,   td1 = sn.element("td", {}, tr)
                        ;
                        sn.element("code", {}, td1, it.id);
                        sn.element("td", {}, tr, [it.description]);
                    }
                    return df;
                }

                else if (obj.type == "interface") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var types = ["attribute", "method", "constant"];
                    var filterFunc = function (it) { return it.type == type; }
                    ,   sortFunc = function (a, b) {
                            if (a.id < b.id) return -1;
                            if (a.id > b.id) return 1;
                            return 0;
                        }
                    ;
                    for (var i = 0; i < types.length; i++) {
                        var type = types[i];
                        var things = obj.children.filter(filterFunc);
                        if (things.length === 0) continue;
                        if (!this.noIDLSorting) {
                            things.sort(sortFunc);
                        }

                        var sec = sn.element("section", {}, df);
                        var secTitle = type;
                        secTitle = secTitle.substr(0, 1).toUpperCase() + secTitle.substr(1) + "s";
                        sn.element("h2", {}, sec, secTitle);
                        var dl = sn.element("dl", { "class": type + "s" }, sec);
                        for (var j = 0; j < things.length; j++) {
                            var it = things[j];
                            var id = (type == "method") ? this.makeMethodID(curLnk, it) : sn.idThatDoesNotExist(curLnk + it.refId);
                            var dt = sn.element("dt", { id: id }, dl);
                            sn.element("code", {}, dt, it.id);
                            var desc = sn.element("dd", {}, dl, [it.description]);
                            if (type == "method") {
                                if (it.params.length) {
                                    var table = sn.element("table", { "class": "parameters" }, desc);
                                    var tr = sn.element("tr", {}, table);
                                    ["Parameter", "Type", "Nullable", "Optional", "Description"].forEach(function (tit) { sn.element("th", {}, tr, tit); });
                                    for (var k = 0; k < it.params.length; k++) {
                                        var prm = it.params[k];
                                        var tr = sn.element("tr", {}, table);
                                        sn.element("td", { "class": "prmName" }, tr, prm.id);
                                        var tyTD = sn.element("td", { "class": "prmType" }, tr);
                                        var code = sn.element("code", {}, tyTD);
                                        code.innerHTML = datatype(prm.datatype);
                                        if (prm.array) code.innerHTML += arrsq(prm);
                                        if (prm.nullable) sn.element("td", { "class": "prmNullTrue" }, tr, "\u2714");
                                        else              sn.element("td", { "class": "prmNullFalse" }, tr, "\u2718");
                                        if (prm.optional) sn.element("td", { "class": "prmOptTrue" }, tr, "\u2714");
                                        else              sn.element("td", { "class": "prmOptFalse" }, tr, "\u2718");
                                        var cnt = prm.description ? [prm.description] : "";
                                        sn.element("td", { "class": "prmDesc" }, tr, cnt);
                                    }
                                }
                                else {
                                    sn.element("div", {}, desc, [sn.element("em", {}, null, "No parameters.")]);
                                }
                                var reDiv = sn.element("div", {}, desc);
                                sn.element("em", {}, reDiv, "Return type: ");

                                var code = sn.element("code", {}, reDiv);
                                code.innerHTML = datatype(it.datatype);
                                if (it.array) code.innerHTML += arrsq(it);
                                if (it.nullable) sn.text(", nullable", reDiv);
                            }
                            else if (type == "attribute") {
                                sn.text(" of type ", dt);
                                if (it.array) {
                                    for (var i = 0, n = it.arrayCount; i < n; i++) sn.text("array of ", dt);
                                }
                                var span = sn.element("span", { "class": "idlAttrType" }, dt);
                                var matched = /^sequence<(.+)>$/.exec(it.datatype);
                                if (matched) {
                                    sn.text("sequence<", span);
                                    sn.element("a", {}, span, matched[1]);
                                    sn.text(">", span);
                                }
                                else {
                                    sn.element("a", {}, span, it.datatype);
                                }
                                if (it.readonly) sn.text(", readonly", dt);
                                if (it.nullable) sn.text(", nullable", dt);
                            }
                            else if (type == "constant") {
                                sn.text(" of type ", dt);
                                sn.element("span", { "class": "idlConstType" }, dt, [sn.element("a", {}, null, it.datatype)]);
                                if (it.nullable) sn.text(", nullable", dt);
                            }
                        }
                    }
                    if (typeof obj.merge !== "undefined" && obj.merge.length > 0) {
                        // hackish: delay the execution until the DOM has been initialized, then merge
                        setTimeout(function () {
                            for (var i = 0; i < obj.merge.length; i++) {
                                var idlInterface = document.querySelector("#idl-def-" + obj.refId),
                                    idlDictionary = document.querySelector("#idl-def-" + obj.merge[i]);
                                idlDictionary.parentNode.parentNode.removeChild(idlDictionary.parentNode);
                                idlInterface.appendChild(document.createElement("br"));
                                idlInterface.appendChild(idlDictionary);
                            }
                        }, 0);
                    }
                    return df;
                }
            },

            makeMethodID:    function (cur, obj) {
                var id = cur + obj.refId + "-" + obj.datatype + "-"
                ,   params = [];
                for (var i = 0, n = obj.params.length; i < n; i++) {
                    var prm = obj.params[i];
                    params.push(prm.datatype + (prm.array ? "Array" : "") + "-" + prm.id);
                }
                id += params.join("-");
                return sanitiseID(id);
            },

            writeAsWebIDL:    function (obj, indent) {
                indent++;
                var opt = { indent: indent, obj: obj, proc: this };
                if (obj.type == "module") {
                    if (obj.id == "outermost") {
                        var $div = $("<div></div>");
                        for (var i = 0; i < obj.children.length; i++) $div.append(this.writeAsWebIDL(obj.children[i], indent - 1));
                        return $div.children();
                    }
                    else return $(idlModuleTmpl(opt));
                }
                else if (obj.type == "typedef") {
                    opt.nullable = obj.nullable ? "?" : "";
                    opt.arr = arrsq(obj);
                    return $(idlTypedefTmpl(opt));
                }
                else if (obj.type == "implements") {
                    return $(idlImplementsTmpl(opt));
                }
                else if (obj.type == "interface") {
                    // stop gap fix for duplicate IDs while we're transitioning the code
                    var div = this.doc.createElement("div")
                    ,   id = $(div).makeID("idl-def", obj.refId, true);
                    var str = "<span class='idlInterface' id='" + id + "'>";
                    if (obj.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + obj.extendedAttributes + "</span>]\n";
                    str += idn(indent);
                    if (obj.partial) str += "partial ";
                    if (obj.callback) str += "callback ";
                    str += "interface <span class='idlInterfaceID'>" + obj.id + "</span>";
                    if (obj.superclasses && obj.superclasses.length) str += " : " +
                                                        obj.superclasses.map(function (it) {
                                                                                return "<span class='idlSuperclass'><a>" + it + "</a></span>";
                                                                            })
                                                                        .join(", ");
                    str += " {\n";
                    // we process attributes and methods in place
                    var maxAttr = 0, maxMeth = 0, maxConst = 0, hasRO = false;
                    obj.children.forEach(function (it, idx) {
                        var len = 0;
                        if (it.isUnionType) len = it.datatype.join(" or ").length + 2;
                        else                len = it.datatype.length;
                        if (it.nullable) len = len + 1;
                        if (it.array) len = len + (2 * it.arrayCount);
                        if (it.type == "attribute") maxAttr = (len > maxAttr) ? len : maxAttr;
                        else if (it.type == "method") maxMeth = (len > maxMeth) ? len : maxMeth;
                        else if (it.type == "constant") maxConst = (len > maxConst) ? len : maxConst;
                        if (it.type == "attribute" && it.readonly) hasRO = true;
                    });
                    var curLnk = "widl-" + obj.refId + "-";
                    for (var i = 0; i < obj.children.length; i++) {
                        var ch = obj.children[i];
                        if (ch.type == "attribute") str += this.writeAttribute(ch, maxAttr, indent + 1, curLnk, hasRO);
                        else if (ch.type == "method") str += this.writeMethod(ch, maxMeth, indent + 1, curLnk);
                        else if (ch.type == "constant") str += this.writeConst(ch, maxConst, indent + 1, curLnk);
                    }
                    str += idn(indent) + "};</span>\n";
                    return str;
                }
                else if (obj.type == "exception") {
                    var str = "<span class='idlException' id='idl-def-" + obj.refId + "'>";
                    if (obj.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + obj.extendedAttributes + "</span>]\n";
                    str += idn(indent) + "exception <span class='idlExceptionID'>" + obj.id + "</span>";
                    if (obj.superclasses && obj.superclasses.length) str += " : " +
                                                        obj.superclasses.map(function (it) {
                                                                                return "<span class='idlSuperclass'><a>" + it + "</a></span>";
                                                                            })
                                                                        .join(", ");
                    str += " {\n";
                    var maxAttr = 0, maxConst = 0;
                    obj.children.forEach(function (it, idx) {
                        var len = it.datatype.length;
                        if (it.nullable) len = len + 1;
                        if (it.array) len = len + (2 * it.arrayCount);
                        if (it.type == "field")   maxAttr = (len > maxAttr) ? len : maxAttr;
                        else if (it.type == "constant") maxConst = (len > maxConst) ? len : maxConst;
                    });
                    var curLnk = "widl-" + obj.refId + "-";
                    for (var i = 0; i < obj.children.length; i++) {
                        var ch = obj.children[i];
                        if (ch.type == "field") str += this.writeField(ch, maxAttr, indent + 1, curLnk);
                        else if (ch.type == "constant") str += this.writeConst(ch, maxConst, indent + 1, curLnk);
                    }
                    str += idn(indent) + "};</span>\n";
                    return str;
                }
                else if (obj.type == "dictionary") {
                    var opt = { obj: obj, indent: indent }
                    ,   max = 0;
                    obj.children.forEach(function (it, idx) {
                        var len = it.datatype.length;
                        if (it.nullable) len = len + 1;
                        if (it.array) len = len + (2 * it.arrayCount);
                        max = (len > max) ? len : max;
                    });
                    var curLnk = "widl-" + obj.refId + "-"
                    ,   $res = $(idlDictionaryTmpl(opt))
                    ,   $ph = $res.find(".PLACEHOLDER")
                    ;
                    for (var i = 0; i < obj.children.length; i++) {
                        $ph.before(this.writeMember(obj.children[i], max, indent + 1, curLnk));
                        $ph.before($ph[0].ownerDocument.createTextNode("\n"));
                    }
                    $ph.remove();
                    return $res;
                }
                else if (obj.type == "callback") {
                    var str = "<span class='idlCallback' id='idl-def-" + obj.refId + "'>";
                    if (obj.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + obj.extendedAttributes + "</span>]\n";
                    str += idn(indent) + "callback <span class='idlCallbackID'>" + obj.id + "</span>";
                    str += " = ";
                    var nullable = obj.nullable ? "?" : "";
                    var arr = arrsq(obj);
                    str += "<span class='idlCallbackType'>" + datatype(obj.datatype) + arr + nullable + "</span> ";
                    str += "(";

                    str += obj.children.map(function (it) {
                                                var nullable = it.nullable ? "?" : "";
                                                var optional = it.optional ? "optional " : "";
                                                var arr = arrsq(it);
                                                var prm = "<span class='idlParam'>";
                                                if (it.extendedAttributes) prm += "[<span class='extAttr'>" + it.extendedAttributes + "</span>] ";
                                                prm += optional + "<span class='idlParamType'>" + datatype(it.datatype) + arr + nullable + "</span> " +
                                                "<span class='idlParamName'>" + it.id + "</span>" +
                                                "</span>";
                                                return prm;
                                            })
                                      .join(", ");
                    str += ");</span>\n";
                    return str;
                }
                else if (obj.type == "enum") {
                    var str = "<span class='idlEnum' id='idl-def-" + obj.refId + "'>";
                    if (obj.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + obj.extendedAttributes + "</span>]\n";
                    str += idn(indent) + "enum <span class='idlEnumID'>" + obj.id + "</span> {\n";

                    for (var i = 0; i < obj.children.length; i++) {
                        var ch = obj.children[i];
                        str += idn(indent + 1) + '"<span class="idlEnumItem">' + ch.id + '</span>"';
                        if (i < obj.children.length - 1) str += ",";
                        str += "\n";
                    }
                    str += idn(indent) + "};</span>\n";
                    return str;
                }
            },

            writeField:    function (attr, max, indent, curLnk) {
                var str = "<span class='idlField'>";
                if (attr.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + attr.extendedAttributes + "</span>]\n";
                str += idn(indent);
                var pad = max - attr.datatype.length;
                if (attr.nullable) pad = pad - 1;
                if (attr.array) pad = pad - (2 * attr.arrayCount);
                var nullable = attr.nullable ? "?" : "";
                var arr = arrsq(attr);
                str += "<span class='idlFieldType'>" + datatype(attr.datatype) + arr + nullable + "</span> ";
                for (var i = 0; i < pad; i++) str += " ";
                str += "<span class='idlFieldName'><a href='#" + curLnk + attr.refId + "'>" + attr.id + "</a></span>";
                str += ";</span>\n";
                return str;
            },

            writeAttribute:    function (attr, max, indent, curLnk, hasRO) {
                var str = "<span class='idlAttribute'>";
                if (attr.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + attr.extendedAttributes + "</span>]\n";
                str += idn(indent);
                if (hasRO) {
                    if (attr.readonly) str += "readonly ";
                    else               str += "         ";
                }
                str += "attribute ";
                var pad = max - attr.datatype.length;
                if (attr.nullable) pad = pad - 1;
                if (attr.array) pad = pad - (2 * attr.arrayCount);
                var nullable = attr.nullable ? "?" : "";
                var arr = arrsq(attr);
                str += "<span class='idlAttrType'>" + datatype(attr.datatype) + arr + nullable + "</span> ";
                for (var i = 0; i < pad; i++) str += " ";
                str += "<span class='idlAttrName'><a href='#" + curLnk + attr.refId + "'>" + attr.id + "</a></span>";
                str += ";</span>\n";
                return str;
            },

            writeMethod:    function (meth, max, indent, curLnk) {
                var str = "<span class='idlMethod'>";
                if (meth.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + meth.extendedAttributes + "</span>]\n";
                str += idn(indent);
                var len = 0;
                if (meth.isUnionType) len = meth.datatype.join(" or ").length + 2;
                else                len = meth.datatype.length;
                var pad = max - len;
                if (meth.nullable) pad = pad - 1;
                if (meth.array) pad = pad - (2 * meth.arrayCount);
                var nullable = meth.nullable ? "?" : "";
                var arr = arrsq(meth);
                str += "<span class='idlMethType'>" + datatype(meth.datatype) + arr + nullable + "</span> ";
                for (var i = 0; i < pad; i++) str += " ";
                var id = this.makeMethodID(curLnk, meth);
                // str += "<span class='idlMethName'><a href='#" + curLnk + meth.refId + "'>" + meth.id + "</a></span> (";
                str += "<span class='idlMethName'><a href='#" + id + "'>" + meth.id + "</a></span> (";
                str += meth.params.map(function (it) {
                                            var nullable = it.nullable ? "?" : "";
                                            var optional = it.optional ? "optional " : "";
                                            var arr = arrsq(it);
                                            var variadic = it.variadic ? "..." : "";
                                            var prm = "<span class='idlParam'>";
                                            if (it.extendedAttributes) prm += "[<span class='extAttr'>" + it.extendedAttributes + "</span>] ";
                                            prm += optional + "<span class='idlParamType'>" + datatype(it.datatype) + arr + nullable + variadic + "</span> " +
                                            "<span class='idlParamName'>" + it.id + "</span>" +
                                            "</span>";
                                            return prm;
                                        })
                                  .join(", ");
                str += ")";
                str += ";</span>\n";
                return str;
            },

            writeConst:    function (cons, max, indent, curLnk) {
                var str = "<span class='idlConst'>";
                if (cons.extendedAttributes) str += idn(indent) + "[<span class='extAttr'>" + cons.extendedAttributes + "</span>]\n";
                str += idn(indent);
                str += "const ";
                var pad = max - cons.datatype.length;
                if (cons.nullable) pad = pad - 1;
                var nullable = cons.nullable ? "?" : "";
                str += "<span class='idlConstType'><a>" + cons.datatype + "</a>" + nullable + "</span> ";
                for (var i = 0; i < pad; i++) str += " ";
                str += "<span class='idlConstName'><a href='#" + curLnk + cons.refId + "'>" + cons.id + "</a></span> = " +
                       "<span class='idlConstValue'>" + cons.value + "</span>;</span>\n";
                return str;
            },

            writeMember:    function (memb, max, indent, curLnk) {
                var opt = { obj: memb, indent: indent, curLnk: curLnk,
                            nullable: (memb.nullable ? "?" : ""), arr: arrsq(memb) };
                opt.pad = max - memb.datatype.length;
                if (memb.nullable) opt.pad = opt.pad - 1;
                if (memb.array) opt.pad = opt.pad - (2 * memb.arrayCount);
                return $(idlDictMemberTmpl(opt));
            }
        };


        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/webidl");
                if (!conf.noIDLSorting) conf.noIDLSorting = false;
                var $idl = $(".idl", doc)
                ,   finish = function () {
                        msg.pub("end", "core/webidl");
                        cb();
                    };
                if (!$idl.length) return finish();
                $(doc).find("head link").first().before($("<style/>").text(css));

                var infNames = [];
                $idl.each(function () {
                    var w = new WebIDLProcessor({ noIDLSorting: conf.noIDLSorting, msg: msg, doc: doc, conf: conf })
                    ,   inf = w.definition($(this))
                    ,   $df = w.makeMarkup(inf.htmlID);
                    $(this).replaceWith($df);
                    if ($.inArray(inf.type, "interface exception dictionary typedef callback enum".split(" ")) !== -1) infNames.push(inf.id);
                });
                doc.normalize();
                $("a:not([href])").each(function () {
                    var $ant = $(this);
                    if ($ant.hasClass("externalDFN")) return;
                    var name = $ant.text();
                    if ($.inArray(name, infNames) !== -1) {
                        $ant.attr("href", "#idl-def-" + name)
                            .addClass("idlType")
                            .html("<code>" + name + "</code>");
                    }
                });
                finish();
            }
        };
    }
);
