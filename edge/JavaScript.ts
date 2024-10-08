import * as cp from 'child_process'
import * as fs from 'fs/promises'
import { glob } from 'glob'
import compact from 'lodash/compact'
import countBy from 'lodash/countBy'
import escapeRegExp from 'lodash/escapeRegExp'
import first from 'lodash/first'
import flatten from 'lodash/flatten'
import isObject from 'lodash/isObject'
import last from 'lodash/last'
import lowerCase from 'lodash/lowerCase'
import memoize from 'lodash/memoize'
import merge from 'lodash/merge'
import once from 'lodash/once'
import pull from 'lodash/pull'
import remove from 'lodash/remove'
import sortBy from 'lodash/sortBy'
import trim from 'lodash/trim'
import trimEnd from 'lodash/trimEnd'
import trimStart from 'lodash/trimStart'
import truncate from 'lodash/truncate'
import uniq from 'lodash/uniq'
import upperFirst from 'lodash/upperFirst'
import without from 'lodash/without'
import words from 'lodash/words'
import { Minimatch } from 'minimatch'
import * as os from 'os'
import * as fp from 'path'
import getMajorVersion from 'semver/functions/major'
import sortVersions from 'semver/functions/sort'
import getHighestVersionSatisfying from 'semver/ranges/max-satisfying'
import { extract } from 'tar/extract'
import * as ts from 'typescript'
import { promisify } from 'util'
import * as vscode from 'vscode'

import FileInfo, { getPosixPath } from './FileInfo'
import { ExtensionConfiguration, Language, Item, findFilesRoughly, tryGetFullPath, setImportNameToClipboard } from './global'
import { isDirectory, isFile, isFileOrDirectory } from './utility'

export interface JavaScriptConfiguration {
	filter: Readonly<{ [key: string]: string }>
}

// #region
const SUPPORTED_EXTENSION = /\.(j|t)sx?$/i
const INDEX_FILE_PATTERN = /(\\|\/)index(\.(j|t)sx?)?$/
const DOT_DIRECTORY = new RegExp('\\' + fp.sep + '\\.')
const JEST_DIRECTORY = new RegExp('\\' + fp.sep + '__\\w+__\\' + fp.sep)

// Copy from https://mathiasbynens.be/demo/javascript-identifier-regex
// eslint-disable-next-line no-misleading-character-class
const JAVASCRIPT_IDENTIFIER_PATTERN = /^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|null|this|true|void|with|await|break|catch|class|const|false|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)(?:[$A-Z_a-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D])(?:[$0-9A-Z_a-z\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B4\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF])*$/

// #endregion

// TODO: this may not work with multi-workspace folders
const getPackageJsonList = memoize(async () => {
	const [packageJsonPathList, npmLockPathList, pnpmLockPathList, yarnLockPathList] = await Promise.all([
		vscode.workspace.findFiles('**/package.json', '**/node_modules/**'),
		vscode.workspace.findFiles('**/package-lock.json', '**/node_modules/**'),
		vscode.workspace.findFiles('**/pnpm-lock.yaml', '**/node_modules/**'),
		vscode.workspace.findFiles('**/yarn.lock', '**/node_modules/**'),
	]).then(linkGroups => linkGroups.map(links => links.map(link => link.fsPath)))

	// TODO: support NPM workspace

	// Represent a map of subdirectory to root directory in absolute paths
	const pnpmWorkspaces = Object.fromEntries(compact(flatten(await Promise.all(pnpmLockPathList.map(async pnpmWorkspacePath => {
		const rootPath = fp.dirname(pnpmWorkspacePath)

		try {
			const { stdout } = await promisify(cp.exec)('pnpm list --recursive --depth -1 --parseable', {
				encoding: 'utf-8',
				cwd: rootPath,
			})
			return stdout.trim().split('\n').map(workspacePath => [vscode.Uri.file(workspacePath).fsPath, rootPath] as const)

		} catch (error) {
			return null
		}
	})))))

	// Represent a map of subdirectory to root directory in absolute paths
	const yarnWorkspaces = Object.fromEntries(compact(flatten(await Promise.all(yarnLockPathList.map(async yarnLockPath => {
		const rootPath = fp.dirname(yarnLockPath)

		try {
			const { stdout } = await promisify(cp.exec)('yarn --json workspaces info', {
				encoding: 'utf-8',
				cwd: rootPath,
			})
			const workspaces = JSON.parse(JSON.parse(stdout).data)
			return Object.values(workspaces)
				.map(workspace => (typeof workspace === 'object' && workspace && 'location' in workspace && typeof workspace.location === 'string' ? workspace.location : null))
				.filter(location => !!location)
				.map(location => [fp.join(rootPath, location), rootPath] as const)

		} catch {
			return null
		}
	})))))

	const outputList = await Promise.all(packageJsonPathList.map(async packageJsonPath => {
		const rootPath = fp.dirname(packageJsonPath)
		const nodeModulePathList: Array<string> = uniq(compact([
			rootPath,
			pnpmWorkspaces[rootPath],
			yarnWorkspaces[rootPath],
		])).map(path => fp.join(path, 'node_modules'))

		const packageManager = await (async (): Promise<'npm' | 'pnpm' | 'yarn'> => {
			if (npmLockPathList.some(path => fp.dirname(path) === rootPath)) {
				return 'npm'
			}

			if (pnpmLockPathList.some(path => fp.dirname(path) === rootPath) || pnpmWorkspaces[rootPath]) {
				return 'pnpm'
			}

			if (yarnLockPathList.some(path => fp.dirname(path) === rootPath) || yarnWorkspaces[rootPath]) {
				return 'yarn'
			}

			const { packageManager } = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) || {}
			if (typeof packageManager === 'string') {
				return packageManager.split('@')[0] as any
			}

			return 'npm'
		})()

		return {
			packageManager,
			packageJsonPath,
			nodeModulePathList,
		}
	}))

	return sortBy(outputList, ({ packageJsonPath }) => -fp.dirname(packageJsonPath).split(fp.sep).length)
})

const getModuleFiles = memoize((modulePath: string) => {
	return glob(
		// Do not use backslashes (Windows) in a Glob pattern
		// See https://www.npmjs.com/package/glob#Windows
		fp.posix.join('**', '*.js'),
		{
			cwd: modulePath,
			ignore: 'node_modules',
		},
	)
})

/**
 * @see https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html
 */
const getDeclarationIdentifiers = memoize(async (moduleName: string, declarationPath: string) => {
	const identifiers: Array<string> = []

	try {
		const codeTree = await JavaScript.parse(declarationPath)
		const nodeList = await getOriginalAndReferencedTopLevelStatements(codeTree)
		// Find `declare module '???' { ... }` where ??? is the module name
		if (moduleName) {
			for (const node of await getDeclarationIdentifiersFromReference(nodeList, [moduleName], codeTree.fileName)) {
				if (ts.canHaveModifiers(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) && isNonComputedNamedNode(node)) {
					// Gather `export`
					identifiers.push(node.name.text)

				} else if (ts.isModuleDeclaration(node)) {
					// Gather `namespace`
					// See https://github.com/date-fns/date-fns/blob/91726f2ab6ac070a71f1a5caa39689a41f200944/typings.d.ts#L97
					identifiers.push(node.name.text)
				}
			}
		}

		// Find `export as namespace ???`
		const exportedNamespace = codeTree.statements.find(ts.isNamespaceExportDeclaration)?.name.text
		if (exportedNamespace) {
			const reference = getFinalDeclarationReference(nodeList, [exportedNamespace])
			// Find `declare module '???' { ... }` where ??? is the reference above
			for (const node of await getDeclarationIdentifiersFromReference(nodeList, reference, codeTree.fileName)) {
				if (ts.isVariableStatement(node)) {
					for (const stub of node.declarationList.declarations) {
						if (ts.isVariableDeclaration(stub) && (ts.isIdentifier(stub.name) || ts.isStringLiteral(stub.name))) {
							identifiers.push(stub.name.text)
						}
					}

				} else if (isNonComputedNamedNode(node)) {
					identifiers.push(node.name.text)
				}
			}
		}

		if (!exportedNamespace) {
			const exportedIdentifiers = await getExportedIdentifiers(codeTree)
			for (const [name] of exportedIdentifiers) {
				identifiers.push(name)
			}
		}

	} catch (error) {
		console.error(error)
	}

	return sortBy(uniq(compact(identifiers)))
}, (moduleName: string, declarationPath: string | undefined) => moduleName + '!' + (declarationPath ?? ''))

type PackageJsonPath = string

interface TSConfig {
	compilerOptions: ts.CompilerOptions
	include?: Array<string>
	exclude?: Array<string>
}

export default class JavaScript implements Language {
	private fileCache: Array<FileItem> = []
	readonly transitExportTracer = new Map<FileDefaultItem['traceID'], Array<FileDefaultItem>>()
	readonly importPattern = new ImportPattern()
	readonly defaultImportCache = new Map<FilePath, IdentifierName>()
	readonly namespaceImportCache = new Map<FilePath, {
		name: IdentifierName
		sourceText: string
	}>()

	readonly nodeModuleCache = new Map<PackageJsonPath, Array<NodeModuleItem>>()
	readonly nodeIdentifierCache = new Map<PackageJsonPath, Array<NodeIdentifierItem>>()
	readonly directModuleCache = new Map<PackageJsonPath, Array<NodeIdentifierItem>>()

	private userConfig: {
		javascript: JavaScriptConfiguration
		typescript: JavaScriptConfiguration
	}

	private tsConfigCache = new Map<string, TSConfig>()

	private tsConfigWatcher: vscode.FileSystemWatcher

	constructor() {
		this.tsConfigWatcher = vscode.workspace.createFileSystemWatcher('**/tsconfig.json')
		this.tsConfigWatcher.onDidCreate(link => {
			this.setTypeScriptConfiguration(link.fsPath)
		})
		this.tsConfigWatcher.onDidChange(link => {
			this.setTypeScriptConfiguration(link.fsPath)
		})
		this.tsConfigWatcher.onDidDelete(link => {
			this.tsConfigCache.delete(link.fsPath)
		})
	}

	setUserConfiguration(config: ExtensionConfiguration) {
		this.userConfig = {
			javascript: config.javascript,
			typescript: config.typescript,
		}
	}

	private async setTypeScriptConfiguration(configFilePath: string) {
		const { config, error } = ts.parseConfigFileTextToJson(configFilePath, await fs.readFile(configFilePath, 'utf-8'))
		if (config && !error) {
			this.tsConfigCache.set(configFilePath, config)
		}
	}

	private getTypeScriptConfiguration(document: vscode.TextDocument): { filePath: string } & TSConfig | undefined {
		for (const [filePath, tsconfig] of sortBy(Array.from(this.tsConfigCache), ([path]) => -fp.dirname(path).split(fp.sep).length)) {
			if (document.uri.fsPath.startsWith(fp.dirname(filePath) + fp.sep)) {
				return {
					filePath,
					...tsconfig,
				}
			}
		}

		return undefined
	}

	private getCompatibleFileExtensions(document: vscode.TextDocument) {
		const originalExtension = trimStart(fp.extname(document.fileName), '.').toLowerCase()
		const list = [originalExtension]
		if (originalExtension.endsWith('x')) {
			list.push(originalExtension.replace(/x$/, ''))

		} else {
			list.push(originalExtension + 'x')
		}

		const tsConfig = this.getTypeScriptConfiguration(document)
		if (tsConfig?.compilerOptions.allowJs) {
			list.push('ts', 'tsx', 'js', 'jsx')
		}

		return uniq(list.filter(extension => SUPPORTED_EXTENSION.test('.' + extension)))
	}

	checkIfImportDefaultIsPreferredOverNamespace(document: vscode.TextDocument) {
		const tsConfig = this.getTypeScriptConfiguration(document)
		if (tsConfig) {
			return tsConfig.compilerOptions.esModuleInterop ?? false
		}

		return true
	}

	private async setFileCache(filePath: string, exportedIdentifierCache?: Map<FilePath, IdentifierMap>, fullPathCache?: { [fullPath: string]: boolean }) {
		if (filePath.includes(fp.sep) === false) {
			return
		}

		if (DOT_DIRECTORY.test(filePath)) {
			return
		}

		if (JEST_DIRECTORY.test(filePath)) {
			return
		}

		if (fp.extname(filePath) === '.git') {
			return
		}

		if (SUPPORTED_EXTENSION.test(filePath) === false) {
			this.fileCache.push(new FileItem(filePath))

			return
		}

		const codeTree = await JavaScript.parse(filePath)
		const existingImports = await getExistingImportsWithFullPath(codeTree, fullPathCache)
		const importedIdentifiers = getImportedIdentifiers(existingImports)

		this.importPattern.selectiveScan(existingImports)

		for (const { kind, identifier, path, fullPath, sourceText } of importedIdentifiers) {
			if (kind === 'default') {
				this.defaultImportCache.set(fullPath || path, identifier)

			} else if (kind === 'namespace') {
				this.namespaceImportCache.set(fullPath || path, {
					name: identifier,
					sourceText,
				})
			}
		}

		const packageJsonList = await getPackageJsonList()
		const packageJsonPath = getClosestPackageJson(filePath, packageJsonList)?.packageJsonPath
		if (packageJsonPath) {
			if (this.nodeIdentifierCache.has(packageJsonPath) === false) {
				this.nodeIdentifierCache.set(packageJsonPath, [])
			}

			const dependencies = this.nodeModuleCache.get(packageJsonPath)

			const nodeIdentifierItems = this.nodeIdentifierCache.get(packageJsonPath)
			for (const { identifier, path, kind } of importedIdentifiers) {
				if (path.startsWith('.') || path.startsWith('!')) {
					continue
				}

				if (lowerCase(identifier).replace(/\s/g, '') === lowerCase(path).replace(/\s/g, '')) {
					continue
				}

				if (nodeIdentifierItems.some(item => item.identifier === identifier && item.name === path)) {
					continue
				}

				const nodeModule = dependencies.find(dependency => path.startsWith(dependency.name + '/'))
				if (nodeModule && identifier === last(path.split('/'))) {
					// Populate direct-module files instead
					nodeModule.directImportIsPreferred = true

					continue
				}

				nodeIdentifierItems.push(new NodeIdentifierItem(path, kind, identifier))
			}
		}

		const exportedIdentifiers = await getExportedIdentifiers(codeTree, exportedIdentifierCache)
		for (const [exportedName, identifier] of exportedIdentifiers) {
			const sourcePath = last(identifier.pathList)
			const item = exportedName === '*default'
				? new FileDefaultItem(filePath, identifier.sourceText, sourcePath)
				: new FileIdentifierItem(filePath, 'named', exportedName, identifier.originalName, identifier.sourceText, sourcePath)
			this.fileCache.push(item)

			const list = uniq([...(this.transitExportTracer.get(item.traceID) || []), item])
			this.transitExportTracer.set(item.traceID, list)
		}
	}

	private workingThread: Promise<void>
	async setItems() {
		if (!this.workingThread) {
			const λ = async () => {
				getPackageJsonList.cache.clear()

				const tsConfigLinks = await vscode.workspace.findFiles('**/tsconfig.json')
				for (const link of tsConfigLinks) {
					this.setTypeScriptConfiguration(link.fsPath)
				}

				const packageJsonList = await getPackageJsonList()
				for (const { packageManager, packageJsonPath, nodeModulePathList } of packageJsonList) {
					if (this.nodeModuleCache.has(packageJsonPath)) {
						continue
					}

					const nodeModuleItems: Array<NodeModuleItem> = []
					this.nodeModuleCache.set(packageJsonPath, nodeModuleItems)

					const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
					const totalDependencyNameList = uniq([packageJson.devDependencies, packageJson.dependencies]
						.flatMap(item => (isObject(item) ? Object.keys(item) : [])))

					const nodeJsTypeDefinitionFilePath = (
						await getNodeJsTypeDefinitionFilePathFromLocalDependency(totalDependencyNameList, nodeModulePathList) ||
						await getNodeJsTypeDefinitionFilePathFromRegistry(fp.dirname(packageJsonPath), packageManager)
					)

					if (nodeJsTypeDefinitionFilePath) {
						const nodeJsAPIs = await getNodeJsAPIs(nodeJsTypeDefinitionFilePath)
						for (const name of nodeJsAPIs) {
							nodeModuleItems.push(new NodeModuleItem(name))
						}
					}

					for (const name of totalDependencyNameList.filter(name => !name.startsWith('@types/'))) {
						nodeModuleItems.push(new NodeModuleItem(name))
					}

					this.nodeModuleCache.set(packageJsonPath, sortBy(nodeModuleItems, item => item.name.toLowerCase()))
				}

				if (this.fileCache.length === 0) {
					const links = await vscode.workspace.findFiles('**/*')

					// Create empty cache objects which will be used in another function
					const exportedIdentifierCache = new Map<FilePath, IdentifierMap>()
					const fullPathCache = Object.fromEntries(links.map(link => [link.fsPath, true]))
					for (const link of links) {
						await this.setFileCache(link.fsPath, exportedIdentifierCache, fullPathCache)
					}

					// Add namespace-imported to the list
					for (const [filePath, { name, sourceText }] of this.namespaceImportCache) {
						this.fileCache.push(new FileIdentifierItem(filePath, 'namespace', name, undefined, sourceText, filePath))
					}
				}

				for (const [packageJsonPath, identifiers] of this.nodeIdentifierCache) {
					this.nodeIdentifierCache.set(packageJsonPath, sortBy(
						identifiers,
						item => item.name.toLowerCase(),
						item => item.identifier.toLowerCase(),
					))
				}

				this.workingThread = null
			}

			this.workingThread = λ()
		}

		await this.workingThread
	}

	async getItems(document: vscode.TextDocument) {
		if (SUPPORTED_EXTENSION.test(document.fileName) === false) {
			return null
		}

		const fileFilter = this.createFileFilter(document)
		const contextAwareFileItems = this.fileCache.filter(item =>
			// Exclude the files according to the environmental context
			fileFilter(item.info) &&

			// Exclude the current opening file
			item.info.fullPath !== document.fileName &&

			// Exclude the other files importing the current opening file
			!(item instanceof FileDefaultItem && item.sourcePath === document.fileName))

		const packageJsonList = await getPackageJsonList()
		const packageJsonPath = getClosestPackageJson(document.fileName, packageJsonList)?.packageJsonPath
		const nodeModuleItems = (packageJsonPath && this.nodeModuleCache.get(packageJsonPath)) || []
		const nodeIdentifierItems = (packageJsonPath && this.nodeModuleCache.has(packageJsonPath) && this.nodeIdentifierCache.get(packageJsonPath)) || []

		return [
			...nodeModuleItems,
			...nodeIdentifierItems,
			...contextAwareFileItems,
		]
	}

	async addItem(filePath: string) {
		await this.setFileCache(filePath)

		if (fp.basename(filePath) === 'package.json') {
			await this.setItems()
		}
	}

	async cutItem(filePath: string) {
		const removingItems = remove(this.fileCache, file => file.info.fullPath === filePath)
		for (const item of removingItems) {
			if (item instanceof FileDefaultItem) {
				pull(this.transitExportTracer.get(item.traceID), item)
			}
		}

		this.defaultImportCache.delete(filePath)
		this.namespaceImportCache.delete(filePath)

		if (fp.basename(filePath) === 'package.json') {
			getPackageJsonList.cache.clear()
			this.nodeModuleCache.delete(filePath)
			this.nodeIdentifierCache.delete(filePath)
		}
	}

	async fixImport(editor: vscode.TextEditor, document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		if (SUPPORTED_EXTENSION.test(document.fileName) === false) {
			return false
		}

		const documentFileInfo = new FileInfo(document.fileName)
		const rootPath = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath
		const compatibleFileExtensions = sortBy(
			this.getCompatibleFileExtensions(document),
			fileExtension => (fileExtension.startsWith(documentFileInfo.fileExtensionWithoutLeadingDot) ? 0 : 1),
		)

		class ImportStatementForFixingImport {
			originalRelativePath: string
			editableRange: vscode.Range
			private matchingFullPaths: Array<string>

			constructor(path: string, start: number, end: number) {
				this.originalRelativePath = path
				this.editableRange = new vscode.Range(document.positionAt(start), document.positionAt(end))
			}

			get quoteChar() {
				const originalText = document.getText(this.editableRange)
				if (originalText.startsWith('\'')) {
					return '\''
				}

				return '"'
			}

			async search() {
				if (this.matchingFullPaths === undefined) {
					this.matchingFullPaths = await findFilesRoughly(this.originalRelativePath, compatibleFileExtensions)
				}

				return this.matchingFullPaths
			}
		}

		class FileItemForFixingImport implements vscode.QuickPickItem {
			readonly label: string
			readonly description: string
			readonly fullPath: string

			constructor(fullPath: string) {
				this.fullPath = fullPath
				this.label = fullPath.substring(rootPath.length)
			}
		}

		const codeTree = await JavaScript.parse(document)
		if (!codeTree) {
			return false
		}

		const totalImports = [
			codeTree.statements
				.filter(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
				.filter((node: ts.ImportDeclaration) => {
					const path = (node.moduleSpecifier as ts.StringLiteral).text
					return (
						path.startsWith('.') &&
						path.includes('?') === false &&
						path.includes('!') === false &&
						path.includes('"') === false
					)
				})
				.map((node: ts.ImportDeclaration) => new ImportStatementForFixingImport(
					(node.moduleSpecifier as ts.StringLiteral).text,
					node.moduleSpecifier.getStart(),
					node.moduleSpecifier.getEnd(),
				)),
			findNodesRecursively<ts.CallExpression>(codeTree, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]))
				.filter(node => (node.arguments[0] as ts.StringLiteral).text.startsWith('.'))
				.map(node => new ImportStatementForFixingImport(
					(node.arguments[0] as ts.StringLiteral).text,
					node.arguments[0].getStart(),
					node.arguments[0].getEnd(),
				)),
		].flat().filter(item => item.originalRelativePath)

		const getBrokenImports = async () => {
			const imports = await Promise.all(totalImports.map(async (stub): Promise<(typeof totalImports)[0] | undefined> => {
				if (
					await isFileOrDirectory(fp.join(documentFileInfo.directoryPath, stub.originalRelativePath)) === false &&
					await isFileOrDirectory(fp.join(documentFileInfo.directoryPath, stub.originalRelativePath + '.' + documentFileInfo.fileExtensionWithoutLeadingDot)) === false
				) {
					return stub
				}

				return undefined
			}))
			return compact(imports)
		}

		const brokenImports = await getBrokenImports()
		if (brokenImports.length === 0) {
			vscode.window.setStatusBarMessage('No broken import/require statements have been found.', 5000)

			return null
		}

		const nonResolvableImports: Array<ImportStatementForFixingImport> = []
		const manualSolvableImports: Array<ImportStatementForFixingImport> = []
		for (const item of brokenImports) {
			if (cancellationToken.isCancellationRequested) {
				return null
			}

			const matchingFullPaths = await item.search()
			if (matchingFullPaths.length === 0) {
				nonResolvableImports.push(item)

			} else if (matchingFullPaths.length === 1) {
				const path = await new FileItem(matchingFullPaths[0]).getRelativePath(document, this.importPattern)
				await editor.edit(worker => {
					worker.replace(item.editableRange, `${item.quoteChar}${path}${item.quoteChar}`)
				})

			} else {
				manualSolvableImports.push(item)
			}
		}

		for (const item of manualSolvableImports) {
			const matchingFullPaths = await item.search()

			const candidateItems = matchingFullPaths.map(path => new FileItemForFixingImport(path))
			const selectedItem = await vscode.window.showQuickPick(candidateItems, {
				placeHolder: item.originalRelativePath,
				ignoreFocusOut: true,
			})

			if (!selectedItem) {
				return null
			}

			if (cancellationToken.isCancellationRequested) {
				return null
			}

			const path = await new FileItem(selectedItem.fullPath).getRelativePath(document, this.importPattern)
			await editor.edit(worker => {
				worker.replace(item.editableRange, `${item.quoteChar}${path}${item.quoteChar}`)
			})
		}

		await JavaScript.fixESLint()

		if (nonResolvableImports.length === 0) {
			vscode.window.setStatusBarMessage('All broken import/require statements have been fixed.', 5000)

		} else {
			vscode.window.showWarningMessage(`There ${nonResolvableImports.length === 1 ? 'was' : 'were'} ${nonResolvableImports.length} broken import/require statement${nonResolvableImports.length === 1 ? '' : 's'} that had not been fixed.`)
		}

		return true
	}

	dispose() {
		if (this.tsConfigWatcher) {
			this.tsConfigWatcher.dispose()
		}
	}

	private createFileFilter(document: vscode.TextDocument) {
		const rootPath = getPosixPath(vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath)
		const filePath = getPosixPath(trimStart(document.fileName.substring(rootPath.length), fp.posix.sep))
		const fileName = escapeRegExp(fp.basename(document.fileName).replace(/\..+/, ''))

		let languageConfig = /^typescript/.test(document.languageId) ? this.userConfig.typescript : this.userConfig.javascript
		if (this.getTypeScriptConfiguration(document)?.compilerOptions.allowJs) {
			languageConfig = merge({}, this.userConfig.javascript, this.userConfig.typescript, languageConfig)
		}

		const targetMatchers = Object.entries(languageConfig?.filter || {})
			.filter(([source]) => new RegExp(source).test(filePath))
			.map(([, target]) => {
				// eslint-disable-next-line no-template-curly-in-string
				return new RegExp(target.replace('${TM_FILENAME_BASE}', fileName))
			})

		const tsconfig = this.getTypeScriptConfiguration(document)

		const jsAllowed = tsconfig?.compilerOptions.allowJs
		const jsExtension = /jsx?$/i

		// Presume the input pattern is written in POSIX style
		const [inclusionList, exclusionList]: Array<Array<(path: string) => boolean>> = [tsconfig?.include, tsconfig?.exclude].map((patterns = []) => patterns.map(relativePattern => {
			const fullPattern = fp.posix.resolve(getPosixPath(fp.dirname(tsconfig.filePath)), relativePattern)
			const globPattern = new Minimatch(fullPattern)
			return path => path === fullPattern || path.startsWith(fullPattern + fp.posix.sep) || globPattern.match(path)
		}))

		return (fileInfo: FileInfo) => {
			if (targetMatchers.length > 0 && fileInfo.fullPathForPOSIX.startsWith(rootPath + fp.posix.sep) && targetMatchers.some(matcher => matcher.test(fileInfo.fullPathForPOSIX.substring(rootPath.length + 1)) === false)) {
				return false
			}

			if (!jsAllowed && jsExtension.test(fileInfo.fileExtensionWithoutLeadingDot)) {
				return false
			}

			if (inclusionList.length > 0 && inclusionList.every(match => !match(fileInfo.fullPathForPOSIX))) {
				return false
			}

			if (exclusionList.length > 0 && exclusionList.some(match => match(fileInfo.fullPathForPOSIX))) {
				return false
			}

			return true
		}
	}

	static async fixESLint() {
		const commands = await vscode.commands.getCommands(true)
		if (commands.indexOf('eslint.executeAutofix') >= 0) {
			await vscode.commands.executeCommand('eslint.executeAutofix')
		}
	}

	static async parse(documentOrFilePath: vscode.TextDocument | string) {
		const filePath = typeof documentOrFilePath === 'string' ? documentOrFilePath : documentOrFilePath.fileName
		if (SUPPORTED_EXTENSION.test(filePath) === false) {
			return null
		}

		try {
			const codeText = typeof documentOrFilePath === 'string' ? await fs.readFile(filePath, 'utf-8') : documentOrFilePath.getText()
			return ts.createSourceFile(filePath, codeText, ts.ScriptTarget.ESNext, true)

		} catch (error) {
			console.error(error)

			return null
		}
	}

	async convertImport(editor: vscode.TextEditor): Promise<boolean> {
		const document = editor.document
		if (SUPPORTED_EXTENSION.test(document.fileName) === false) {
			return false
		}

		const codeTree = await JavaScript.parse(document)
		if (!codeTree) {
			return false
		}

		const statementEnding = this.importPattern.statementEnding.semi >= this.importPattern.statementEnding.none ? ';' : ''
		const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
		for (const statement of Array.from(codeTree.statements).reverse()) {
			if (!ts.isVariableStatement(statement)) {
				continue
			}

			const importList: Array<string> = []
			for (const node of statement.declarationList.declarations) {
				const nameAndPath = await this.getRequireNameAndPath(node)
				if (nameAndPath) {
					let name = nameAndPath.name
					const path = nameAndPath.path
					// Check if it should write `import * as...` instead of `import default`
					if (name.startsWith('{') === false && document.isUntitled === false && vscode.workspace.getWorkspaceFolder(document.uri)) {
						if (path.startsWith('.')) {
							const fullPath = await tryGetFullPath([fp.dirname(document.fileName), path], fp.extname(document.fileName))
							if (fullPath === undefined) {
								continue
							}

							const identifiers = await getExportedIdentifiers(fullPath)
							if (identifiers.has('*default') === false) {
								name = '* as ' + name
							}

						} else if (this.checkIfImportDefaultIsPreferredOverNamespace(document) === false) {
							name = '* as ' + name
						}
					}

					importList.push(`import ${name} from '${path}'`)
				}
			}

			if (importList.length === 0) {
				continue
			}

			const importText = importList.join(statementEnding + lineEnding)
			await editor.edit(worker => worker.replace(
				new vscode.Range(document.positionAt(statement.getStart()), document.positionAt(statement.getEnd())),
				importText,
			))
		}

		return true
	}

	private async getRequireNameAndPath(node: ts.VariableDeclaration) {
		if (!node.initializer) {
			return null
		}

		if (

			// Check for `x = require('...')`
			ts.isCallExpression(node.initializer) &&
			ts.isIdentifier(node.initializer.expression) &&
			node.initializer.expression.text === 'require' &&
			node.initializer.arguments.length === 1
		) {
			const [firstArgument] = node.initializer.arguments
			if (ts.isStringLiteral(firstArgument)) {
				return {
					name: node.name.getText().trim(),
					path: firstArgument.text,
				}
			}
		}

		if (

			// Check for `const x = require('...').default`
			ts.isPropertyAccessExpression(node.initializer) &&
			ts.isCallExpression(node.initializer.expression) &&
			ts.isIdentifier(node.initializer.expression.expression) &&
			node.initializer.expression.expression.text === 'require' &&
			node.initializer.expression.arguments.length === 1
		) {
			const [firstArgument] = node.initializer.expression.arguments
			if (ts.isStringLiteral(firstArgument)) {
				const directImportName = node.initializer.name.text
				if (ts.isIdentifier(node.name)) {
					return {
						name: '{ ' + directImportName + ' as ' + node.name.text + ' }',
						path: firstArgument.text,
					}
				}

				if (directImportName === 'default' && ts.isObjectBindingPattern(node.name) && node.name.elements.length > 0) {
					return {
						name: '{ ' + node.name.elements.map(stub => stub.getText().trim()).join(', ') + ' }',
						path: firstArgument.text,
					}
				}
			}
		}

		return null
	}
}

class FileItem implements Item {
	readonly id: string
	readonly info: FileInfo
	label: string
	description: string

	constructor(filePath: string) {
		this.id = filePath
		this.info = new FileInfo(filePath)

		this.label = this.info.fileNameWithExtension

		const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))
		if (workspace) {
			this.description = trim(this.info.fileNameWithExtension.substring(workspace.uri.fsPath.length), fp.sep)

		} else {
			this.description = this.info.fileNameWithExtension
		}
	}

	async addImport(editor: vscode.TextEditor, language: JavaScript) {
		if (!editor) {
			return
		}

		const document = editor.document
		if (document.uri.fsPath === this.info.fullPath) {
			vscode.window.showErrorMessage('You cannot import the current active file.', { modal: true })

			return
		}

		// Save the current active cursor position as the asynchronous operations below might take too long to finish
		const activeCursorPosition = editor.selection.active

		const path = await this.getRelativePath(document, language.importPattern)
		if (/^(css|less|sass|scss|styl)$/.test(this.info.fileExtensionWithoutLeadingDot)) {
			const codeTree = await JavaScript.parse(document)
			if (!codeTree) {
				return
			}

			const existingImports = getExistingImports(codeTree)
			const duplicateImport = getDuplicateImport(existingImports, path)
			if (duplicateImport) {
				return
			}

			const snippet = await getImportOrRequireSnippet('infer', null, null, path, document, language.importPattern)
			await editor.edit(worker => worker.insert(getInsertionPosition(existingImports, path, document), snippet))
			await JavaScript.fixESLint()

			return
		}

		if (this.info.fileExtensionWithoutLeadingDot === 'json') {
			const autoName = words(this.info.fileNameWithoutExtension.replace(/\..+/g, '')).join('')
			const snippet = await getImportOrRequireSnippet('require', 'default', autoName, path, document, language.importPattern)
			await editor.edit(worker => worker.insert(activeCursorPosition, snippet))
			await JavaScript.fixESLint()
			setImportNameToClipboard(autoName)

			return
		}

		const snippet = await getImportOrRequireSnippet('require', null, null, path, document, language.importPattern)
		await editor.edit(worker => worker.insert(activeCursorPosition, snippet))
		await JavaScript.fixESLint()
	}

	async getRelativePath(document: vscode.TextDocument, importPattern: ImportPattern) {
		const directoryPath = new FileInfo(document.fileName).directoryPath
		const relativePath = this.info.getRelativePath(directoryPath)
		return normalizeImportPath(relativePath, this.info, importPattern)
	}
}

class FileDefaultItem extends FileItem {
	declare readonly id: string
	detail: string

	get traceID() {
		return this.sourcePath
	}

	constructor(
		filePath: string,
		public readonly sourceText: string,
		public readonly sourcePath: string,
	) {
		super(filePath)

		this.id = filePath

		this.label = this.info.fileNameWithExtension

		const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))
		if (workspace) {
			this.description = trim(this.info.fullPath.substring(workspace.uri.fsPath.length), fp.sep)

		} else {
			this.description = this.info.fullPath
		}

		this.detail = truncate(sourceText, {
			length: 120,
			omission: '...',
		})
	}

	protected async getImportPattern(document: vscode.TextDocument, language: JavaScript): Promise<{
		name: string
		kind: ImportKind
		path: string
	} | null> {
		return {
			name: language.defaultImportCache.get(this.info.fullPath),
			kind: 'default',
			path: await this.getRelativePath(document, language.importPattern),
		}
	}

	async addImport(editor: vscode.TextEditor, language: JavaScript) {
		if (!editor) {
			return
		}

		const document = editor.document
		if (document.uri.fsPath === this.info.fullPath) {
			vscode.window.showErrorMessage('You cannot import the current active file.', { modal: true })

			return
		}

		const codeTree = await JavaScript.parse(document)
		if (!codeTree) {
			return
		}

		// Use the shortest path automatically when there is a file that re-exports the selected identifier (for example, an index file) and vice versa depends on the path of the current active document
		const priorityAlternativeFileItems = sortBy(
			language.transitExportTracer.get(this.traceID),
			// Put the origial file first
			item => (item.info.fullPath === item.sourcePath ? 0 : 1),
			// Put the deeper path first
			item => item.info.fullPath.split(fp.sep).length * -1,
			// Put index files last
			item => (INDEX_FILE_PATTERN.test(item.info.fullPath) ? 1 : 0),
		)
		const shortestPathAlternativeItem = priorityAlternativeFileItems.find(item => document.uri.fsPath.startsWith(fp.dirname(item.info.fullPath) + fp.sep)) || last(priorityAlternativeFileItems)
		if (shortestPathAlternativeItem !== this) {
			// Prevent an infinite loop and allow to fallthrough
			await shortestPathAlternativeItem.addImport(editor, language)

			return
		}

		const [existingImports, { name, kind, path }] = await Promise.all([
			getExistingImportsWithFullPath(codeTree),
			this.getImportPattern(document, language),
		])

		const duplicateImport = getDuplicateImport(existingImports, path)
		if (duplicateImport) {
			// Try merging the given named import with the existing imports
			if (ts.isImportDeclaration(duplicateImport.node) && duplicateImport.node.importClause) {
				// There are 9 cases as a product of 3 by 3 cases:
				// 1) `import default from "path"`
				// 2) `import * as namespace from "path"`
				// 3) `import { named } from "path"`

				if (kind === 'namespace') {
					if (duplicateImport.node.importClause.namedBindings) {
						// Try merging `* as namespace` with `* as namespace`
						// Try merging `* as namespace` with `{ named }`
						vscode.window.showErrorMessage(`The import of "${name}" already exists.`, { modal: true })
						focusAt(duplicateImport.node.importClause.namedBindings, document)

						return
					}

					// Try merging `* as namespace` with `default`
					let givenName = name
					if (duplicateImport.node.importClause.name.text === name) {
						const conflictedIdentifierNode = duplicateImport.node.importClause.name
						const options = [
							{
								title: 'Rename The Default',
								action: async () => {
									// Do not `await` here because it does not work anyway
									vscode.commands.executeCommand('editor.action.rename', [document.uri, document.positionAt(conflictedIdentifierNode.getStart())])

									return name
								},
							},
							{
								title: 'Name The Namespace',
								action: async () => {
									return vscode.window.showInputBox({
										ignoreFocusOut: true,
										value: name,
										validateInput: inputText => (JAVASCRIPT_IDENTIFIER_PATTERN.test(inputText) ? null : 'Not a valid JavaScript identifier.'),
									})
								},
							},
						]
						const selectedOption = await vscode.window.showWarningMessage(`The identifier "${name}" has been used.`, { modal: true }, ...options)
						if (!selectedOption) {
							return
						}

						givenName = await selectedOption.action()

						if (!givenName) {
							return
						}
					}

					const position = document.positionAt(duplicateImport.node.importClause.name.getEnd())
					await editor.edit(worker => worker.insert(position, ', * as ' + givenName))
					await JavaScript.fixESLint()
					setImportNameToClipboard(givenName)

					return

				} else if (kind === 'named') {
					if (duplicateImport.node.importClause.namedBindings && ts.isNamespaceImport(duplicateImport.node.importClause.namedBindings)) {
						// Try merging `{ named }` with `* as namespace`
						const namespaceImport = duplicateImport.node.importClause.namedBindings
						vscode.window.showErrorMessage(`The import of "${path}" already exists as "${namespaceImport.name.text}".`, { modal: true })
						focusAt(namespaceImport, document)

						return

					} else if (duplicateImport.node.importClause.name) {
						// Try merging `{ named }` with `default`
						const position = document.positionAt(duplicateImport.node.importClause.name.getEnd())
						await editor.edit(worker => worker.insert(position, ', { ' + name + ' }'))
						await JavaScript.fixESLint()
						setImportNameToClipboard(name)

						return

					} else if (ts.isNamedImports(duplicateImport.node.importClause.namedBindings)) {
						// Try merging `{ named }` with `{ named }`
						if (duplicateImport.node.importClause.namedBindings.elements.some(node => node.name.text === name)) {
							return
						}

						if (duplicateImport.node.importClause.namedBindings.elements.length > 0) {
							await insertNamedImportToExistingImports(name, duplicateImport.node.importClause.namedBindings.elements, editor)
							await JavaScript.fixESLint()

							return
						}

						// Try merging `{ named }` with `{ }`
						const position = document.positionAt(duplicateImport.node.importClause.namedBindings.getEnd() - 1)
						await editor.edit(worker => worker.insert(position, name))
						await JavaScript.fixESLint()
						setImportNameToClipboard(name)

						return
					}

				} else if (kind === 'default') {
					// In case of `import default from "path"`
					if (duplicateImport.node.importClause.name) {
						// Try merging `default` with `default`
						return

					} else if (ts.isNamespaceImport(duplicateImport.node.importClause.namedBindings)) {
						// Try merging `default` with `* as namespace`
						let givenName = name
						if (duplicateImport.node.importClause.namedBindings.name.text === name) {
							// Cannot have a rename option here because of adding the identifier at the left side of the renaming position
							givenName = await await vscode.window.showInputBox({
								ignoreFocusOut: true,
								value: name,
								validateInput: inputText => (JAVASCRIPT_IDENTIFIER_PATTERN.test(inputText) ? null : 'Not a valid JavaScript identifier.'),
							})

							if (!givenName) {
								return
							}
						}

						const position = document.positionAt(duplicateImport.node.importClause.namedBindings.getStart())
						await editor.edit(worker => worker.insert(position, givenName + ', '))
						await JavaScript.fixESLint()
						setImportNameToClipboard(givenName)

						return
					}

					// Try merging `default` with `{ named }`
					const position = document.positionAt(duplicateImport.node.importClause.namedBindings.getStart())
					await editor.edit(worker => worker.insert(position, name + ', '))
					await JavaScript.fixESLint()
					setImportNameToClipboard(name)

					return

				} else {
					// In case of an invalid state
					return
				}

			} else {
				return
			}
		}

		let importPattern = language.importPattern
		if (existingImports.length > 0) {
			importPattern = new ImportPattern()
			importPattern.selectiveScan(existingImports)
			importPattern.inconclusiveScan(codeTree)
			importPattern.decisiveScan(language.importPattern)
		}

		const snippet = await getImportOrRequireSnippet('infer', kind, name, path, document, importPattern)
		await editor.edit(worker => worker.insert(getInsertionPosition(existingImports, path, document), snippet))
		await JavaScript.fixESLint()
		setImportNameToClipboard(name)
	}
}

class FileIdentifierItem extends FileDefaultItem {
	declare readonly id: string

	get traceID() {
		return this.sourcePath + '|' + (this.originalName || this.exportedName)
	}

	constructor(
		filePath: string,
		public readonly kind: 'named' | 'namespace',
		public readonly exportedName: string,
		public readonly originalName: string | undefined,
		sourceText: string,
		sourcePath: string,
	) {
		super(filePath, sourceText, sourcePath)

		this.id = filePath + '|' + kind + '|' + exportedName

		this.label = exportedName
	}

	protected async getImportPattern(document: vscode.TextDocument, language: JavaScript): Promise<{
		name: string
		kind: ImportKind
		path: string
	} | null> {
		return {
			name: this.exportedName,
			kind: this.kind,
			path: await this.getRelativePath(document, language.importPattern),
		}
	}
}

class NodeModuleItem implements Item {
	readonly id: string
	readonly name: string
	label: string
	description: string
	directImportIsPreferred = false

	constructor(name: string) {
		this.id = name
		this.name = name

		this.label = name
	}

	async addImport(editor: vscode.TextEditor, language: JavaScript) {
		return this.addImportInternal(editor, language, undefined)
	}

	protected async addImportInternal(
		editor: vscode.TextEditor,
		language: JavaScript,
		preselect: {
			kind: 'default' | 'namespace' | 'named'
			name: string
		} | undefined,
	) {
		if (!editor) {
			return
		}

		const document = editor.document

		const codeTree = await JavaScript.parse(document)
		if (!codeTree) {
			return
		}

		const existingImports = await getExistingImportsWithFullPath(codeTree)

		const getImportPattern = once(() => {
			if (existingImports.length > 0) {
				const importPattern = new ImportPattern()
				importPattern.selectiveScan(existingImports)
				importPattern.inconclusiveScan(codeTree)
				importPattern.decisiveScan(language.importPattern)

				return importPattern
			}

			return language.importPattern
		})

		const packageJsonList = await getPackageJsonList()
		const packageJsonPath = getClosestPackageJson(document.fileName, packageJsonList)?.packageJsonPath

		const defaultImportIsPreferred = language.checkIfImportDefaultIsPreferredOverNamespace(document)

		const getPrettyName = (name: string) => words(last(name.split('/'))).map(upperFirst).join('')
		const autoName = getPrettyName(this.name)
		const process = async (kind: ImportKind, name: string, path: string) => {
			const duplicateImport = existingImports.find(item => item.path === path)
			if (!duplicateImport) {
				// Insert import statement normally
				const snippet = await getImportOrRequireSnippet('infer', kind, name, path, document, getImportPattern())
				await editor.edit(worker => worker.insert(getInsertionPosition(existingImports, path, document), snippet))
				await JavaScript.fixESLint()
				setImportNameToClipboard(name)

				return
			}

			if (
				!ts.isImportDeclaration(duplicateImport.node) ||
				!duplicateImport.node.importClause ||
				(
					duplicateImport.node.importClause.namedBindings &&
					ts.isNamespaceImport(duplicateImport.node.importClause.namedBindings)
				)
			) {
				vscode.window.showErrorMessage(`The import of "${path}" already exists.`, { modal: true })
				focusAt(duplicateImport.node, document)

				return
			}

			if (kind === 'default') {
				if (duplicateImport.node.importClause.name) {
					// Try merging `default` with `default`
					// Do nothing

				} else if (duplicateImport.node.importClause.namedBindings && ts.isNamedImports(duplicateImport.node.importClause.namedBindings)) {
					// Try merging `default` with `{ named }`
					const position = document.positionAt(duplicateImport.node.importClause.namedBindings.getStart())
					const formerName = language.defaultImportCache.get(path) || name
					await editor.edit(worker => worker.insert(position, formerName + ', '))
					await JavaScript.fixESLint()
					setImportNameToClipboard(formerName)
				}

			} else {
				if (duplicateImport.node.importClause.namedBindings && ts.isNamedImports(duplicateImport.node.importClause.namedBindings)) {
					// Try merging `{ named }` with `{ named }`
					if (duplicateImport.node.importClause.namedBindings.elements.some(node => node.name.text === name)) {
						// Do nothing

					} else {
						if (duplicateImport.node.importClause.namedBindings.elements.length > 0) {
							await insertNamedImportToExistingImports(name, duplicateImport.node.importClause.namedBindings.elements, editor)
							await JavaScript.fixESLint()

						} else {
							// Try merging `{ named }` with `{ }`
							const position = document.positionAt(duplicateImport.node.importClause.namedBindings.getEnd() - 1)
							await editor.edit(worker => worker.insert(position, name))
							await JavaScript.fixESLint()
							setImportNameToClipboard(name)
						}
					}

				} else if (duplicateImport.node.importClause.name) {
					// Try merging `{ named }` with `default`
					const position = document.positionAt(duplicateImport.node.importClause.name.getEnd())
					await editor.edit(worker => worker.insert(position, ', { ' + name + ' }'))
					await JavaScript.fixESLint()
					setImportNameToClipboard(name)
				}
			}
		}

		if (preselect) {
			await process(preselect.kind, preselect.name, this.name)

			return
		}

		if (this.directImportIsPreferred) {
			const directImportResolution = (async () => {
				const modulePath = await this.getModulePath(document, packageJsonList)
				if (!modulePath) {
					throw new Error('Could not find "modulePath"')
				}

				const relativeFilePaths = await getModuleFiles(modulePath)
				const publicRelativeFilePaths = relativeFilePaths.filter(path => !path.split(/\\|\//g).some(slug => slug.startsWith('_')))

				return {
					modulePath,
					items: publicRelativeFilePaths.map(path => ({ label: path })),
				}
			})()

			const select = await new Promise<string | null>(resolve => {
				let accepted = false
				const picker = vscode.window.createQuickPick()
				picker.placeholder = this.name
				picker.busy = true
				picker.onDidAccept(async () => {
					const [select] = picker.selectedItems
					if (select) {
						resolve(select.label)
					}

					accepted = !!select
					picker.dispose()
				})
				picker.onDidHide(() => {
					if (!accepted) {
						resolve(null)
					}
				})
				picker.show()

				directImportResolution.then(({ items }) => {
					picker.items = items
					picker.busy = false
				})
			})

			if (!select) {
				return
			}

			const { modulePath } = await directImportResolution
			const file = new FileInfo(fp.join(modulePath, select))

			const path = normalizeImportPath(this.name + '/' + select.replace(/\\/g, fp.posix.sep), file, getImportPattern())

			const { kind, name } = await (async (): Promise<{
				kind: ImportKind
				name: string
			}> => {
				if (language.defaultImportCache.has(path)) {
					return {
						kind: 'default',
						name: language.defaultImportCache.get(path),
					}
				}

				if (language.namespaceImportCache.has(path)) {
					return {
						kind: 'namespace',
						name: language.namespaceImportCache.get(path)!.name,
					}
				}

				let name = file.fileNameWithoutExtension
				if (name === 'index') {
					name = file.directoryName
				}

				if (!JAVASCRIPT_IDENTIFIER_PATTERN.test(name)) {
					name = getPrettyName(name)
				}

				const codeTree = await JavaScript.parse(file.fullPath)
				const fileHasDefaultExport = hasExportDefault(codeTree)

				return {
					kind: fileHasDefaultExport || defaultImportIsPreferred ? 'default' : 'namespace',
					name,
				}
			})()

			await process(kind, name, path)

			return
		}

		const declarationPath = await getDeclarationPath(this.name, document, packageJsonList)
		const declarationTypes = await getDeclarationIdentifiers(this.name, declarationPath)
		const typeHasDefaultExport = declarationTypes.includes('*default')

		const namedImportItems = language.nodeIdentifierCache.get(packageJsonPath)?.filter(item => item.name === this.name) || []
		if (
			defaultImportIsPreferred &&
			(
				without(declarationTypes, '*default').length === 0 ||
				namedImportItems.length === 0 ||
				(namedImportItems.length === 1 && namedImportItems[0].kind === 'default')
			)
		) {
			await process('default', language.defaultImportCache.get(this.name) || autoName, this.name)

			return
		}

		if (namedImportItems.some(item => item.kind === 'namespace')) {
			await process('namespace', language.namespaceImportCache.get(this.name)?.name || autoName, this.name)

			return
		}

		const select = await vscode.window.showQuickPick([
			typeHasDefaultExport || defaultImportIsPreferred ? 'default' : '*',
			...without(declarationTypes, '*default'),
		], { placeHolder: this.name })

		if (!select) {
			return
		}

		if (select === 'default') {
			await process('default', language.defaultImportCache.get(this.name) || autoName, this.name)

		} else if (select === '*') {
			await process('namespace', language.namespaceImportCache.get(this.name)?.name || autoName, this.name)

		} else {
			await process('named', select, this.name)
		}
	}

	private async getModulePath(
		document: vscode.TextDocument,
		packageJsonList: Array<{
			packageJsonPath: string
			nodeModulePathList: Array<string>
		}>,
	): Promise<string | undefined> {
		const packageJson = getClosestPackageJson(document.fileName, packageJsonList)
		if (!packageJson || !packageJson.nodeModulePathList) {
			return undefined
		}

		// Traverse through the deepest `node_modules` first
		for (const rootPath of sortBy(packageJson.nodeModulePathList).reverse()) {
			const modulePath = fp.join(rootPath, this.name)
			if (await isDirectory(modulePath)) {
				return modulePath
			}
		}

		return undefined
	}
}

function getFinalDeclarationReference(nodeList: ReadonlyArray<ts.Statement>, name: Array<string>, visitedNodes = new Set<ts.Node>()): Array<string> {
	const getNamedPaths = (β: ts.QualifiedName): Array<string> => {
		if (ts.isQualifiedName(β.left)) {
			return [...getNamedPaths(β.left), β.right.text]
		}

		return [β.left.text, β.right.text]
	}

	if (name.length > 1) {
		return name
	}

	for (const node of nodeList) {
		if (visitedNodes.has(node)) {
			continue
		}

		visitedNodes.add(node)

		// Find `declare const A: B.C`
		if (
			ts.isVariableStatement(node) &&
			node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword) &&
			ts.isVariableDeclarationList(node.declarationList)
		) {
			for (const stub of node.declarationList.declarations) {
				if (
					ts.isIdentifier(stub.name) &&
					stub.name.text === name[0] &&
					stub.initializer === undefined &&
					stub.type &&
					ts.isTypeReferenceNode(stub.type)
				) {
					if (ts.isIdentifier(stub.type.typeName)) {
						return getFinalDeclarationReference(nodeList, [stub.type.typeName.text], visitedNodes)

					} else if (ts.isQualifiedName(stub.type.typeName)) {
						return getFinalDeclarationReference(nodeList, getNamedPaths(stub.type.typeName), visitedNodes)
					}
				}
			}
		}
	}

	return name
}

async function getDeclarationIdentifiersFromReference(nodeList: ReadonlyArray<ts.Statement>, reference: Array<string>, originalFilePath: string) {
	const output: Array<ts.Node> = []

	const namespaces = nodeList.filter((node): node is ts.ModuleDeclaration & { body: ts.ModuleBlock } =>
		ts.isModuleDeclaration(node) &&
		node.modifiers?.some(node => node.kind === ts.SyntaxKind.DeclareKeyword) &&
		node.body &&
		ts.isModuleBlock(node.body))

	for (const node of namespaces) {
		if (
			node.parent &&
			ts.isSourceFile(node.parent) &&
			(
				(
					node.parent.fileName === originalFilePath &&
					node.name.text === reference[0]
				) ||
				(
					ts.isStringLiteral(node.name) &&
					node.name.text.startsWith('.') &&
					(await tryGetFullPath([fp.dirname(node.parent.fileName), node.name.text], getFileExtensionWithoutLeadingDot(node.parent.fileName))) === originalFilePath.replace(/\//g, fp.sep)
				)
			)
		) {
			if (reference.length === 1) {
				// Gather all members inside `declare namespace ??? { ... }`
				output.push(...node.body.statements)

			} else {
				for (const stub of node.body.statements) {
					if (ts.isInterfaceDeclaration(stub) && stub.name.text === reference[1]) {
						// Gather all members inside `interface ??? { ... }`
						output.push(...stub.members)
					}
				}
			}
		}
	}

	return output
}

class NodeIdentifierItem extends NodeModuleItem {
	declare readonly id: string
	readonly kind: 'default' | 'namespace' | 'named'
	readonly identifier: string

	constructor(name: string, kind: 'default' | 'namespace' | 'named', identifier: string) {
		super(name)

		this.id = name + '|' + identifier + '|' + kind
		this.kind = kind
		this.identifier = identifier

		this.label = identifier
		this.description = name
	}

	async addImport(editor: vscode.TextEditor, language: JavaScript) {
		const preselect = {
			kind: this.kind,
			name: this.identifier,
		}
		return super.addImportInternal(editor, language, preselect)
	}
}

class ImportPattern {
	fileExtensionExclusion = new Set<string>(['js', 'jsx', 'ts', 'tsx'])

	syntax = {
		imports: 0,
		requires: 0,
	}

	indexFile = {
		visible: 0,
		hidden: 0,
	}

	quoteCharacters = {
		single: 0,
		double: 0,
	}

	statementEnding = {
		semi: 0,
		none: 0,
	}

	selectiveScan(imports: Array<ImportStatementForScanning>) {
		const stringNodes = imports.flatMap(({ node }) => findNodesRecursively<ts.StringLiteral>(node, node => ts.isStringLiteral(node)))
		const quoteCount = countBy(stringNodes, node => node.getText().trim().charAt(0))
		this.quoteCharacters.single += quoteCount['\''] ?? 0
		this.quoteCharacters.double += quoteCount['"'] ?? 0

		for (const { node, path, fullPath } of imports) {
			if (ts.isImportDeclaration(node)) {
				this.syntax.imports += 1

			} else {
				this.syntax.requires += 1
			}

			if (node.getText().trim().endsWith(';')) {
				this.statementEnding.semi += 1

			} else {
				this.statementEnding.none += 1
			}

			if (fullPath && SUPPORTED_EXTENSION.test(fullPath)) {
				const fileExtensionWithLeadingDot = fp.extname(fullPath)
				if (INDEX_FILE_PATTERN.test(fullPath)) {
					if (INDEX_FILE_PATTERN.test(path)) {
						this.indexFile.visible += 1

					} else {
						this.indexFile.hidden += 1
					}

				} else {
					const fileExtensionWithoutLeadingDot = fileExtensionWithLeadingDot.replace(/^\./, '')
					if (path.endsWith(fileExtensionWithLeadingDot)) {
						this.fileExtensionExclusion.delete(fileExtensionWithoutLeadingDot)

					} else {
						this.fileExtensionExclusion.add(fileExtensionWithoutLeadingDot)
					}
				}
			}
		}
	}

	inconclusiveScan(codeTree: ts.SourceFile) {
		if (this.quoteCharacters.single === 0 && this.quoteCharacters.double === 0) {
			for (const node of findNodesRecursively<ts.StringLiteral>(codeTree, node => ts.isStringLiteral(node))) {
				const char = node.getFirstToken().getText()
				if (char === '\'') {
					this.quoteCharacters.single++

				} else if (char === '"') {
					this.quoteCharacters.double++
				}
			}
		}

		if (this.statementEnding.semi === 0 && this.statementEnding.none === 0) {
			for (const node of codeTree.statements.concat(findNodesRecursively(codeTree, node => ts.isBlock(node)))) {
				if (node.getLastToken().getText().endsWith(';')) {
					this.statementEnding.semi++
				}
			}
		}
	}

	decisiveScan(another: ImportPattern) {
		if (this.syntax.imports === this.syntax.requires) {
			this.syntax.imports += another.syntax.imports
			this.syntax.requires += another.syntax.requires
		}

		if (this.indexFile.visible === this.indexFile.hidden) {
			this.indexFile.visible += another.indexFile.visible
			this.indexFile.hidden += another.indexFile.hidden
		}

		if (this.quoteCharacters.single === this.quoteCharacters.double) {
			this.quoteCharacters.single += another.quoteCharacters.single
			this.quoteCharacters.double += another.quoteCharacters.double
		}

		if (this.statementEnding.semi === this.statementEnding.none) {
			this.statementEnding.semi += another.statementEnding.semi
			this.statementEnding.none += another.statementEnding.none
		}
	}
}

function getRequirePath(node: ts.Node): string | undefined {
	if (node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1) {
		const firstArgument = node.arguments[0]
		if (ts.isStringLiteral(firstArgument)) {
			return firstArgument.text
		}
	}

	return undefined
}

interface ImportStatementForReadOnly {
	node: ts.ImportDeclaration | ts.VariableStatement | ts.ExpressionStatement
	path: string
	sourceText: string
}

function getExistingImports(codeTree: ts.SourceFile) {
	const imports: Array<ImportStatementForReadOnly> = []
	if (!codeTree) {
		return imports
	}

	codeTree.forEachChild(node => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			// For `import '...'`
			//     `import name from '...'`
			//     `import { name } from '...'`
			imports.push({
				node,
				path: trimEnd(node.moduleSpecifier.text, '/'),
				sourceText: node.getText(),
			})

		} else if (ts.isVariableStatement(node)) {
			// For `var name = require('...')`
			//     `var { name } = require('...')`
			node.declarationList.declarations.forEach(stub => {
				if (ts.isVariableDeclaration(stub) && stub.initializer && getRequirePath(stub.initializer)) {
					imports.push({
						node,
						path: getRequirePath(stub.initializer),
						sourceText: node.getText(),
					})
				}
			})

		} else if (ts.isExpressionStatement(node) && getRequirePath(node.expression)) {
			// For `require('...')`
			imports.push({
				node,
				path: getRequirePath(node.expression),
				sourceText: node.getText(),
			})
		}
	})

	return imports
}

interface ImportStatementForScanning extends ImportStatementForReadOnly {
	// Do not write optional (?) as this cannot be compatible with ImportStatementForReadOnly
	fullPath: string | undefined
}

async function getExistingImportsWithFullPath(codeTree: ts.SourceFile, fullPathCache?: { [fullPath: string]: boolean }): Promise<Array<ImportStatementForScanning>> {
	const imports = getExistingImports(codeTree)

	return Promise.all(imports.map(async stub => ({
		...stub,
		fullPath: stub.path.startsWith('.') ? await tryGetFullPath([fp.dirname(codeTree.fileName), stub.path], fp.extname(codeTree.fileName), undefined, fullPathCache) : undefined,
	})))
}

async function insertNamedImportToExistingImports(name: string, existingImports: ts.NodeArray<ts.ImportSpecifier>, editor: vscode.TextEditor) {
	const { document } = editor
	const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
	for (let index = 0; index < existingImports.length; index++) {
		if (name > existingImports[index].name.text) {
			continue
		}

		let separator = ', '
		const [prevImportLineNumber, thisImportLineNumber, nextImportLineNumber] =
			[existingImports[index - 1], existingImports[index], existingImports[index + 1]].map(item => (item ? document.positionAt(item.getStart()).line : null))

		if (
			(nextImportLineNumber !== null && thisImportLineNumber !== nextImportLineNumber) ||
			(prevImportLineNumber !== null && prevImportLineNumber !== thisImportLineNumber)
		) {
			separator = ',' + lineEnding + document.lineAt(thisImportLineNumber).text.match(/^(\s|\t)*/)[0]
		}

		const position = document.positionAt(existingImports[index].getStart())
		await editor.edit(worker => worker.insert(position, name + separator))
		setImportNameToClipboard(name)

		return
	}

	let separator = ', '
	if (existingImports.length > 1) {
		const lastImportLineNumber = document.positionAt(existingImports[existingImports.length - 1].getStart()).line
		const prevImportLineNumber = document.positionAt(existingImports[existingImports.length - 2].getStart()).line
		if (lastImportLineNumber !== prevImportLineNumber) {
			separator = ',' + lineEnding + document.lineAt(lastImportLineNumber).text.match(/^(\s|\t)*/)[0]
		}
	}

	const position = document.positionAt(existingImports[existingImports.length - 1].getEnd())
	await editor.edit(worker => worker.insert(position, separator + name))
	setImportNameToClipboard(name)
}

type ImportKind = 'default' | 'namespace' | 'named' | null

async function getImportOrRequireSnippet(
	syntax: 'import' | 'require' | 'infer',
	kind: ImportKind,
	name: string | null,
	path: string,
	document: vscode.TextDocument,
	importPattern: ImportPattern,
): Promise<string> {
	const quote = importPattern.quoteCharacters.single >= importPattern.quoteCharacters.double ? '\'' : '"'

	const statementEnding = importPattern.statementEnding.semi > importPattern.statementEnding.none ? ';' : ''

	const lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
	if (
		(syntax === 'import' || syntax === 'infer') &&
		(
			importPattern.syntax.imports > importPattern.syntax.requires ||
			(importPattern.syntax.requires === 0 && /^typescript(react)?$/.test(document.languageId))
		)
	) {
		if (!kind || !name) {
			return `import ${quote}${path}${quote}` + statementEnding + lineEnding

		} else if (kind === 'default') {
			return `import ${name} from ${quote}${path}${quote}` + statementEnding + lineEnding

		} else if (kind === 'namespace') {
			return `import * as ${name} from ${quote}${path}${quote}` + statementEnding + lineEnding

		} else if (kind === 'named') {
			return `import { ${name} } from ${quote}${path}${quote}` + statementEnding + lineEnding
		}
	}

	if (kind === null || !name) {
		return `require(${quote}${path}${quote})`

	} else if (kind === 'named') {
		return `const { ${name} } = require(${quote}${path}${quote})` + statementEnding + lineEnding
	}

	return `const ${name} = require(${quote}${path}${quote})` + statementEnding + lineEnding
}

type FilePath = string
type IdentifierName = string
interface IdentifierMap extends Map<IdentifierName, {
	originalName?: string
	sourceText: string
	sourceKind?: ts.SyntaxKind
	pathList: Array<string>
}> { }

function δ(name: string) {
	return name === 'default' ? '*default' : name
}

async function getOriginalAndReferencedTopLevelStatements(originalCodeTree: ts.SourceFile, processingFilePaths = new Set<string>()) {
	const codeList: Array<ts.Statement> = []
	// Prevent looping indefinitely because of a cyclic dependency
	if (processingFilePaths.has(originalCodeTree.fileName)) {
		return []
	}

	processingFilePaths.add(originalCodeTree.fileName)

	for (const { fileName } of originalCodeTree.referencedFiles) {
		const path = await tryGetFullPath([fp.dirname(originalCodeTree.fileName), fileName], 'd.ts')
		if (!path) {
			continue
		}

		const referencedCodeTree = await JavaScript.parse(path)
		if (!referencedCodeTree) {
			continue
		}

		codeList.push(...(await getOriginalAndReferencedTopLevelStatements(referencedCodeTree, processingFilePaths)))
	}

	codeList.push(...originalCodeTree.statements)

	return codeList
}

async function getExportedIdentifiers(filePathOrCodeTree: string | ts.SourceFile, cache = new Map<FilePath, IdentifierMap>(), processingFilePaths = new Set<string>()) {
	const exportedNames: IdentifierMap = new Map()
	if (!filePathOrCodeTree) {
		return exportedNames
	}

	const filePath = typeof filePathOrCodeTree === 'string' ? filePathOrCodeTree : filePathOrCodeTree.fileName.replace(/\//g, fp.sep)
	if (cache.has(filePath)) {
		return cache.get(filePath)
	}

	// Prevent looping indefinitely because of a cyclic dependency
	if (processingFilePaths.has(filePath)) {
		return exportedNames
	}

	processingFilePaths.add(filePath)

	const codeTree = typeof filePathOrCodeTree === 'string' ? await JavaScript.parse(filePath) : filePathOrCodeTree
	if (!codeTree) {
		return exportedNames
	}

	const fileDirectory = fp.dirname(filePath)
	const fileExtension = getFileExtensionWithoutLeadingDot(filePath)

	const localNames: IdentifierMap = new Map()
	const φ = (node: ts.BindingName, text: string) => {
		if (ts.isIdentifier(node)) {
			localNames.set(node.text, {
				sourceText: text,
				pathList: [filePath],
			})

		} else if (ts.isObjectBindingPattern(node)) {
			for (const stub of node.elements) {
				φ(stub.name, text)
			}

		} else if (ts.isArrayBindingPattern(node)) {
			for (const stub of node.elements) {
				if (ts.isBindingElement(stub)) {
					φ(stub.name, text)
				}
			}
		}
	}

	try {
		for (const node of codeTree.statements) {
			if (
				(
					ts.isFunctionDeclaration(node) ||
					ts.isClassDeclaration(node) ||
					ts.isEnumDeclaration(node) ||
					ts.isInterfaceDeclaration(node) ||
					ts.isTypeAliasDeclaration(node)
				) &&
				node.name?.text
			) {
				localNames.set(node.name.text, {
					originalName: node.name.text,
					sourceText: node.getText(),
					sourceKind: node.kind,
					pathList: [],
				})

			} else if (ts.isVariableStatement(node)) {
				for (const stub of node.declarationList.declarations) {
					φ(stub.name, stub.getText())
				}
			}
		}

		for (const node of codeTree.statements) {
			if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.importClause) {
				if (/^[./]/.test(node.moduleSpecifier.text) === false) {
					continue
				}

				const path = await resolveFullPathInsideModule(node.moduleSpecifier.text, fileDirectory, fileExtension)
				if (!path) {
					continue
				}

				const transitIdentifiers = await getExportedIdentifiers(path, cache, processingFilePaths)
				if (node.importClause.name) {
					// Example:
					// import named from "path"
					if (transitIdentifiers.has('*default')) {
						const { sourceText, sourceKind, pathList } = transitIdentifiers.get('*default')
						localNames.set(node.importClause.name.text, {
							originalName: '*default',
							sourceText,
							sourceKind,
							pathList: [path, ...pathList],
						})
					}
				}

				if (node.importClause.namedBindings) {
					if (ts.isNamedImports(node.importClause.namedBindings)) {
						// Example:
						// import { named } from "path"
						for (const stub of node.importClause.namedBindings.elements) {
							const name = stub.name.text
							if (transitIdentifiers.has(name)) {
								const { sourceText, sourceKind, pathList } = transitIdentifiers.get(name)
								localNames.set(name, {
									originalName: name,
									sourceText,
									sourceKind,
									pathList: [path, ...pathList],
								})
							}
						}

					} else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
						// Example:
						// import * as namespace from "path"
						// TODO: find the correct text by tracing `Namespace.Named`
						localNames.set(node.importClause.namedBindings.name.text, {
							sourceText: node.getText(),
							pathList: [path],
						})
					}
				}

			} else if (ts.isExportDeclaration(node)) {
				// Note that "path" could be an actual file or another node module
				const path = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
					await resolveFullPathInsideModule(node.moduleSpecifier.text, fileDirectory, fileExtension)

				if (node.exportClause && ts.isNamedExports(node.exportClause)) {
					for (const stub of node.exportClause.elements) {
						const name = stub.name.text
						if (path) {
							const transitIdentifiers = await getExportedIdentifiers(path, cache, processingFilePaths)
							if (stub.propertyName && transitIdentifiers.has(δ(stub.propertyName.text))) {
								// Example:
								// export { named as exported } from "path"
								const { originalName, sourceText, sourceKind, pathList } = transitIdentifiers.get(δ(stub.propertyName.text))
								exportedNames.set(name, {
									originalName,
									sourceText,
									sourceKind,
									pathList: [filePath, path, ...pathList],
								})

							} else if (transitIdentifiers.has(name)) {
								// Example:
								// export { named } from "path"
								const { originalName, sourceText, sourceKind, pathList } = transitIdentifiers.get(name)
								exportedNames.set(name, {
									originalName,
									sourceText,
									sourceKind,
									pathList: [filePath, path, ...pathList],
								})
							}

						} else {
							if (stub.propertyName && localNames.has(stub.propertyName.text)) {
								// Example:
								// export { named as exported }
								const { originalName, sourceText, sourceKind, pathList } = localNames.get(stub.propertyName.text)
								exportedNames.set(name, {
									originalName,
									sourceText,
									sourceKind,
									pathList: [filePath, ...pathList],
								})

							} else if (localNames.has(name)) {
								// Example:
								// import named from "path"
								// export { named }
								const { originalName, sourceText, sourceKind, pathList } = localNames.get(name)
								exportedNames.set(name, {
									originalName,
									sourceText,
									sourceKind,
									pathList: [filePath, ...pathList],
								})

							} else {
								// Example:
								// const named = ...
								// export { named }
								exportedNames.set(name, {
									originalName: name,
									sourceText: '',
									pathList: [filePath],
								})
							}
						}
					}

				} else {
					// Example:
					// export * from "path"
					const transitIdentifiers = await getExportedIdentifiers(path, cache, processingFilePaths)
					transitIdentifiers.forEach(({ originalName, sourceText, sourceKind, pathList }, name) => {
						exportedNames.set(name, {
							originalName,
							sourceText,
							sourceKind,
							pathList: [filePath, ...pathList],
						})
					})
				}

			} else if (ts.isExportAssignment(node)) {
				if (ts.isIdentifier(node.expression)) {
					// Example:
					// export default named
					const name = node.expression.text
					if (localNames.has(name)) {
						const { originalName, sourceText, sourceKind, pathList } = localNames.get(name)
						exportedNames.set('*default', {
							originalName,
							sourceText,
							sourceKind,
							pathList: [filePath, ...pathList],
						})

					} else {
						exportedNames.set('*default', {
							originalName: name,
							sourceText: node.getText(),
							pathList: [filePath],
						})
					}

				} else {
					// Example:
					// export default {}
					exportedNames.set('*default', {
						sourceText: node.getText(),
						sourceKind: node.expression.kind,
						pathList: [filePath],
					})
				}

			} else if (
				(
					ts.isFunctionDeclaration(node) ||
					ts.isClassDeclaration(node) ||
					ts.isEnumDeclaration(node) ||
					ts.isInterfaceDeclaration(node) ||
					ts.isTypeAliasDeclaration(node)
				) &&
				node.modifiers && node.modifiers.length > 0 && node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
			) {
				if (node.modifiers.length > 1 && node.modifiers[1].kind === ts.SyntaxKind.DefaultKeyword) {
					// Example:
					// export default function () {}
					// export default function named () {}
					if (ts.isFunctionDeclaration(node) && node.name) {
						exportedNames.set('*default', {
							originalName: node.name.text,
							sourceText: node.getText(),
							sourceKind: node.kind,
							pathList: [filePath],
						})

					} else {
						exportedNames.set('*default', {
							sourceText: node.getText(),
							sourceKind: node.kind,
							pathList: [filePath],
						})
					}

				} else if (node.name) {
					// Example:
					// export function named () {}
					// export class named {}
					// export interface named {}
					// export type named = ...
					// export enum named = ...
					exportedNames.set(node.name.text, {
						originalName: node.name.text,
						sourceText: node.getText(),
						sourceKind: node.kind,
						pathList: [filePath],
					})
				}

			} else if (
				ts.isVariableStatement(node) &&
				node.modifiers && node.modifiers.length > 0 && node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
			) {
				// Example:
				// export const named = ...
				for (const stub of node.declarationList.declarations) {
					if (ts.isIdentifier(stub.name)) {
						if (stub.initializer && ts.isIdentifier(stub.initializer) && localNames.has(stub.initializer.text)) {
							const { originalName, sourceKind, pathList } = localNames.get(stub.initializer.text)
							exportedNames.set(stub.name.text, {
								originalName,
								sourceText: node.getText(),
								sourceKind,
								pathList: [filePath, ...pathList],
							})

						} else {
							exportedNames.set(stub.name.text, {
								originalName: stub.name.text,
								sourceText: node.getText(),
								pathList: [filePath],
							})
						}
					}
				}

			} else if (
				ts.isExpressionStatement(node) &&
				ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				ts.isPropertyAccessExpression(node.expression.left) &&
				ts.isIdentifier(node.expression.left.expression) && node.expression.left.expression.text === 'module' && node.expression.left.name.text === 'exports'
			) {
				// Example:
				// module.exports = ...
				if (ts.isIdentifier(node.expression.right)) {
					const name = node.expression.right.text
					if (localNames.has(name)) {
						const { originalName, sourceText, sourceKind, pathList } = localNames.get(name)
						exportedNames.set('*default', {
							originalName,
							sourceText,
							sourceKind,
							pathList: [filePath, ...pathList],
						})

					} else {
						exportedNames.set('*default', {
							originalName: name,
							sourceText: node.getText(),
							pathList: [filePath],
						})
					}

				} else {
					exportedNames.set('*default', {
						sourceText: node.getText(),
						sourceKind: node.expression.right.kind,
						pathList: [filePath],
					})
				}

			} else if (
				ts.isExpressionStatement(node) &&
				ts.isBinaryExpression(node.expression) &&
				ts.isPropertyAccessExpression(node.expression.left) &&
				ts.isPropertyAccessExpression(node.expression.left.expression) &&
				ts.isIdentifier(node.expression.left.expression.expression) &&
				node.expression.left.expression.expression.text === 'module' &&
				ts.isIdentifier(node.expression.left.expression.name) &&
				node.expression.left.expression.name.text === 'exports'
			) {
				// Example:
				// module.exports.named = ...
				if (ts.isIdentifier(node.expression.right)) {
					const name = node.expression.right.text
					if (localNames.has(name)) {
						const { originalName, sourceText, sourceKind, pathList } = localNames.get(name)
						exportedNames.set(node.expression.left.name.text, {
							originalName,
							sourceText,
							sourceKind,
							pathList: [filePath, ...pathList],
						})

					} else {
						exportedNames.set(node.expression.left.name.text, {
							originalName: name,
							sourceText: node.getText(),
							pathList: [filePath],
						})
					}

				} else {
					exportedNames.set(node.expression.left.name.text, {
						sourceText: node.getText(),
						sourceKind: node.expression.right.kind,
						pathList: [filePath],
					})
				}
			}
		}

	} catch (error) {
		console.error(error)
	}

	if (cache.has(filePath) === false) {
		cache.set(filePath, exportedNames)
	}

	processingFilePaths.delete(filePath)

	return exportedNames
}

function getImportedIdentifiers<T extends ImportStatementForReadOnly>(imports: Array<T>) {
	const output: Array<Omit<T, 'node'> & {
		identifier: string
		kind: 'named' | 'namespace' | 'default'
	}> = []

	for (const { node, ...rest } of imports) {
		if (ts.isImportDeclaration(node) && node.importClause) {
			if (node.importClause.name) {
				output.push({
					...rest,
					identifier: node.importClause.name.text,
					kind: 'default',
				})
			}

			if (node.importClause.namedBindings) {
				if (ts.isNamespaceImport(node.importClause.namedBindings)) {
					output.push({
						...rest,
						identifier: node.importClause.namedBindings.name.text,
						kind: 'namespace',
					})

				} else if (ts.isNamedImports(node.importClause.namedBindings)) {
					for (const stub of node.importClause.namedBindings.elements) {
						output.push({
							...rest,
							identifier: stub.propertyName?.text ?? stub.name.text,
							kind: 'named',
						})
					}
				}
			}

		} else if (ts.isVariableStatement(node)) {
			node.declarationList.declarations.forEach(stub => {
				if (ts.isIdentifier(stub.name)) {
					output.push({
						...rest,
						identifier: stub.name.text,
						kind: 'default',
					})

				} else if (ts.isObjectBindingPattern(stub.name)) {
					stub.name.elements.forEach(elem => {
						if (ts.isIdentifier(elem.name)) {
							output.push({
								...rest,
								identifier: elem.propertyName && ts.isIdentifier(elem.propertyName) ? elem.propertyName.text : elem.name.text,
								kind: 'named',
							})
						}
					})
				}
			})
		}
	}

	return output
}

function getDuplicateImport(existingImports: Array<ImportStatementForReadOnly>, path: string) {
	return existingImports.find(stub => stub.path === path)
}

function getInsertionPosition(existingImports: Array<ImportStatementForReadOnly>, path: string, document: vscode.TextDocument) {
	if (existingImports.length > 0) {
		if (path.startsWith('.')) {
			const fileImportList = existingImports.filter(stub => stub.path.startsWith('.'))
			const targetImport = fileImportList.findLast(stub => stub.path.localeCompare(path) === -1)
			if (targetImport) {
				return document.positionAt(targetImport.node.getEnd()).translate({ lineDelta: +1 }).with({ character: 0 })

			} else if (fileImportList.length > 0) {
				return document.positionAt(last(fileImportList).node.getEnd()).translate({ lineDelta: +1 }).with({ character: 0 })
			}

			return document.positionAt(last(existingImports).node.getEnd()).translate({ lineDelta: +1 }).with({ character: 0 })
		}

		const nodeImportList = existingImports.filter(stub => stub.path.startsWith('.') === false)
		const targetImport = nodeImportList.findLast(stub => stub.path.localeCompare(path) === -1)
		if (targetImport) {
			return document.positionAt(targetImport.node.getEnd()).translate({ lineDelta: +1 }).with({ character: 0 })

		} else if (nodeImportList.length > 0) {
			return document.positionAt(first(nodeImportList).node.getStart())
		}

		return document.positionAt(first(existingImports).node.getStart())
	}

	return new vscode.Position(0, 0)
}

function findNodesRecursively<T extends ts.Node>(node: ts.Node, condition: (node: ts.Node) => boolean, results: Array<T> = [], visited = new Set<ts.Node>()) {
	if (node === null || node === undefined) {
		return results
	}

	if (visited.has(node)) {
		return results
	}

	visited.add(node)

	if (condition(node)) {
		results.push(node as T)

		return results
	}

	node.forEachChild(stub => {
		findNodesRecursively(stub, condition, results, visited)
	})

	return results
}

function focusAt(node: {
	getStart: () => number
	getEnd: () => number
}, document: vscode.TextDocument) {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		return
	}

	editor.revealRange(
		new vscode.Range(
			document.positionAt(node.getStart()),
			document.positionAt(node.getEnd()),
		),
		vscode.TextEditorRevealType.InCenterIfOutsideViewport,
	)
}

async function getNodeJsTypeDefinitionFilePathFromLocalDependency(
	dependencyNameList: Array<string>,
	nodeModulePathList: Array<string>,
): Promise<string | null> {
	if (!dependencyNameList.some(name => name === '@types/node')) {
		return null
	}

	for (const nodeModulePath of nodeModulePathList) {
		const typeDefinitionFilePath = fp.join(nodeModulePath, '@types', 'node', 'index.d.ts')
		if (await fs.access(typeDefinitionFilePath).then(() => true, () => false)) {
			return typeDefinitionFilePath
		}
	}

	return null
}

async function getNodeJsTypeDefinitionFilePathFromRegistry(
	workingDirectoryPath: string,
	packageManager: string,
): Promise<string | null> {
	const nodeVersion = (await (async () => {
		const run = (command: string) =>
			promisify(cp.exec)(command, {
				encoding: 'utf-8',
				cwd: workingDirectoryPath,
			})
				.then(({ stdout }) => stdout.trim().replace(/^v/, ''), () => '')

		if (packageManager === 'pnpm') {
			// Support PNPM as Node.js version manager
			// See https://pnpm.io/npmrc#use-node-version
			return await run('pnpm exec node --version')
		}

		return await run('node --version')
	})())

	if (!nodeVersion) {
		return null
	}

	const nodeTypeDirectoryPath = fp.join(os.tmpdir(), `node-types-v${nodeVersion}`)

	try {
		if (await fs.access(nodeTypeDirectoryPath).then(() => false, () => true)) {
			// Find the most recent compatible version available on https://www.npmjs.com/package/@types/node
			const { versions } = await (await fetch('https://registry.npmjs.org/@types/node')).json() as {
				versions: Record<string, {
					dist: { tarball: string }
					types: string
				}>
			}
			const { dist: { tarball } } = (
				versions[nodeVersion] ||
				versions[getHighestVersionSatisfying(Object.keys(versions), `>=${getMajorVersion(nodeVersion)}.0.0 && <=${nodeVersion}`)] ||
				versions[sortVersions(Object.keys(versions)).at(-1)]
			)

			// Download the package and extract onto the local temporary directory
			const downloadedFileBody = (await fetch(tarball)).body
			const downloadedFilePath = nodeTypeDirectoryPath + '.tgz'
			await fs.writeFile(downloadedFilePath, downloadedFileBody)
			await fs.mkdir(nodeTypeDirectoryPath)
			await extract({
				file: downloadedFilePath,
				cwd: nodeTypeDirectoryPath,
			})
		}

		const subdirectoryName = (await fs.readdir(nodeTypeDirectoryPath))[0]
		return fp.join(nodeTypeDirectoryPath, subdirectoryName, 'index.d.ts')

	} catch (error) {
		console.error(error)

		await fs.rm(nodeTypeDirectoryPath, {
			force: true,
			recursive: true,
		})
	}

	return null
}

const getNodeJsAPIs = memoize(async (typeDefinitionFilePath: string): Promise<Array<string>> => {
	const codeTree = await JavaScript.parse(typeDefinitionFilePath)
	if (!codeTree) {
		return []
	}

	const fromCurrentFile = Array.from(codeTree.statements)
		.map((node): string | undefined => {
			if (
				ts.isModuleDeclaration(node) &&
				node.modifiers && node.modifiers.length > 0 &&
				node.modifiers[0].kind === ts.SyntaxKind.DeclareKeyword &&
				(ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))
			) {
				// Return XXX in `declare module "XXX" { ... }`
				return node.name.text
			}

			return undefined
		})

	const fromOtherFiles = (await Promise.all(codeTree.referencedFiles.map(({ fileName }) => getNodeJsAPIs(fp.join(fp.dirname(typeDefinitionFilePath), fileName))))).flat()

	return without(
		compact(uniq([...fromCurrentFile, ...fromOtherFiles])),
		'NodeJS',
		'setTimeout',
		'setImmediate',
	)
})

function getClosestPackageJson<T extends { packageJsonPath: string }>(filePath: string, packageJsonList: Array<T>) {
	return packageJsonList.find(({ packageJsonPath }) => filePath.startsWith(fp.dirname(packageJsonPath) + fp.sep))
}

async function resolveFullPathInsideModule(moduleNameOrFilePath: string, fileDirectory: string, fileExtension: string) {
	// Escape Webpack special import syntax
	if (moduleNameOrFilePath.startsWith('!')) {
		moduleNameOrFilePath = moduleNameOrFilePath.substring(1)
	}

	if (moduleNameOrFilePath.startsWith('.')) {
		return tryGetFullPath([fileDirectory, moduleNameOrFilePath], fileExtension)
	}

	const packageJsonList = await getPackageJsonList()
	if (await Promise.all([
		isFile(fp.join(fileDirectory, 'package.json')),
		isDirectory(fp.join(fileDirectory, 'node_modules')),
	])) {
		packageJsonList.push({
			packageManager: undefined,
			packageJsonPath: fp.join(fileDirectory, 'package.json'),
			nodeModulePathList: [fp.join(fileDirectory, 'node_modules')],
		})
	}

	return getDeclarationPath(moduleNameOrFilePath, { fileName: fileDirectory + fp.sep }, packageJsonList)
}

function normalizeImportPath(relativePath: string, fileInfo: FileInfo, importPattern: ImportPattern) {
	// Remove "/index.js" from the path
	if (INDEX_FILE_PATTERN.test(fileInfo.fullPathForPOSIX) && importPattern.indexFile.hidden > importPattern.indexFile.visible) {
		return fp.dirname(relativePath)
	}

	// Remove file extension from the path
	if (importPattern.fileExtensionExclusion.has(fileInfo.fileExtensionWithoutLeadingDot)) {
		return relativePath.replace(new RegExp(escapeRegExp(fp.extname(fileInfo.fileNameWithExtension)) + '$'), '')
	}

	return relativePath
}

function getFileExtensionWithoutLeadingDot(fileName: string) {
	if (/\.d\.ts$/.test(fileName)) {
		return 'd.ts'
	}

	return trimStart(fp.extname(fileName), '.')
}

async function getDeclarationPath(
	moduleName: string,
	document: Pick<vscode.TextDocument, 'fileName'>,
	packageJsonList: Array<{
		packageJsonPath: string
		nodeModulePathList: Array<string>
	}>,
): Promise<string | undefined> {
	const packageJson = getClosestPackageJson(document.fileName, packageJsonList)
	if (!packageJson || !packageJson.nodeModulePathList) {
		return undefined
	}

	// Traverse through the deepest `node_modules` first
	for (const rootPath of sortBy(packageJson.nodeModulePathList).reverse()) {
		const possiblePathList = [
			moduleName,
			fp.join('@types', moduleName.replace(/^@/, '').replace(/\//, '__')),
		].map(path => fp.join(rootPath, 'node_modules', path, 'package.json'))

		for (const packageJsonPath of possiblePathList) {
			if (await isFile(packageJsonPath)) {
				try {
					const { types, typings } = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
					const declarationPath = types ?? typings
					if (typeof declarationPath === 'string') {
						// Return `undefined` if not found
						return await tryGetFullPath([fp.dirname(packageJsonPath), declarationPath.replace(/\//g, fp.sep)], 'd.ts')
					}

				} catch (error) {
					// Do nothing
				}
			}
		}

		const indexDeclarationPath = fp.join(rootPath, 'node_modules', moduleName, 'index.d.ts')
		if (await isFile(indexDeclarationPath)) {
			return indexDeclarationPath
		}
	}

	return undefined
}

function hasExportDefault(codeTree: Pick<ts.SourceFile, 'statements'>) {
	return codeTree.statements.some(node =>

		// Example:
		// export default named
		ts.isExportAssignment(node) ||

		// Example:
		// export default function named() {}
		(
			(
				ts.isFunctionDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isEnumDeclaration(node) ||
				ts.isInterfaceDeclaration(node) ||
				ts.isTypeAliasDeclaration(node)
			) &&
			node.modifiers && node.modifiers.length > 1 &&
			node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword &&
			node.modifiers[1].kind === ts.SyntaxKind.DefaultKeyword
		) ||

		// Example:
		// module.exports = ...
		(
			ts.isExpressionStatement(node) &&
			ts.isBinaryExpression(node.expression) &&
			ts.isPropertyAccessExpression(node.expression.left) &&
			ts.isIdentifier(node.expression.left.expression) &&
			node.expression.left.expression.text === 'module' &&
			ts.isIdentifier(node.expression.left.name) &&
			node.expression.left.name.text === 'exports'
		))
}

function isNonComputedNamedNode(node: ts.Node): node is ts.DeclarationStatement {
	return 'name' in node && (ts.isIdentifier((node as ts.NamedDeclaration).name) || ts.isStringLiteral((node as ts.NamedDeclaration).name))
}
