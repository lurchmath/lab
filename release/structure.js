var Structure,bind=function(t,e){return function(){return t.apply(e,arguments)}};exports.Structure=Structure=function(){function t(){this.clearComputedAttribute=bind(this.clearComputedAttribute,this),this.setComputedAttribute=bind(this.setComputedAttribute,this),this.getComputedAttribute=bind(this.getComputedAttribute,this),this.computedAttributes={}}return t.prototype.getComputedAttribute=function(t){return this.computedAttributes[t]},t.prototype.setComputedAttribute=function(t,e){return this.computedAttributes[t]=e},t.prototype.clearComputedAttribute=function(t){return delete this.computedAttributes[t]},t}();
//# sourceMappingURL=structure.js.map