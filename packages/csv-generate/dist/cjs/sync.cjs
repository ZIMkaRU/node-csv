'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var stream = require('stream');
var util = require('util');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var stream__default = /*#__PURE__*/_interopDefaultLegacy(stream);
var util__default = /*#__PURE__*/_interopDefaultLegacy(util);

const Generator = function(options = {}){
  // Convert Stream Readable options if underscored
  if(options.high_water_mark){
    options.highWaterMark = options.high_water_mark;
  }
  if(options.object_mode){
    options.objectMode = options.object_mode;
  }
  // Call parent constructor
  stream__default["default"].Readable.call(this, options);
  // Clone and camelize options
  this.options = {};
  for(const k in options){
    this.options[Generator.camelize(k)] = options[k];
  }
  // Normalize options
  const dft = {
    columns: 8,
    delimiter: ',',
    duration: null,
    encoding: null,
    end: null,
    eof: false,
    fixedSize: false,
    length: -1,
    maxWordLength: 16,
    rowDelimiter: '\n',
    seed: false,
    sleep: 0,
  };
  for(const k in dft){
    if(this.options[k] === undefined){
      this.options[k] = dft[k];
    }
  }
  // Default values
  if(this.options.eof === true){
    this.options.eof = this.options.rowDelimiter;
  }
  // State
  this._ = {
    start_time: this.options.duration ? Date.now() : null,
    fixed_size_buffer: '',
    count_written: 0,
    count_created: 0,
  };
  if(typeof this.options.columns === 'number'){
    this.options.columns = new Array(this.options.columns);
  }
  const accepted_header_types = Object.keys(Generator).filter((t) => (!['super_', 'camelize'].includes(t)));
  for(let i = 0; i < this.options.columns.length; i++){
    const v = this.options.columns[i] || 'ascii';
    if(typeof v === 'string'){
      if(!accepted_header_types.includes(v)){
        throw Error(`Invalid column type: got "${v}", default values are ${JSON.stringify(accepted_header_types)}`);
      }
      this.options.columns[i] = Generator[v];
    }
  }
  return this;
};
util__default["default"].inherits(Generator, stream__default["default"].Readable);

// Generate a random number between 0 and 1 with 2 decimals. The function is idempotent if it detect the "seed" option.
Generator.prototype.random = function(){
  if(this.options.seed){
    return this.options.seed = this.options.seed * Math.PI * 100 % 100 / 100;
  }else {
    return Math.random();
  }
};
// Stop the generation.
Generator.prototype.end = function(){
  this.push(null);
};
// Put new data into the read queue.
Generator.prototype._read = function(size){
  // Already started
  const data = [];
  let length = this._.fixed_size_buffer.length;
  if(length !== 0){
    data.push(this._.fixed_size_buffer);
  }
  // eslint-disable-next-line
  while(true){
    // Time for some rest: flush first and stop later
    if((this._.count_created === this.options.length) || (this.options.end && Date.now() > this.options.end) || (this.options.duration && Date.now() > this._.start_time + this.options.duration)){
      // Flush
      if(data.length){
        if(this.options.objectMode){
          for(const record of data){
            this.__push(record);
          }
        }else {
          this.__push(data.join('') + (this.options.eof ? this.options.eof : ''));
        }
        this._.end = true;
      }else {
        this.push(null);
      }
      return;
    }
    // Create the record
    let record = [];
    let recordLength;
    this.options.columns.forEach((fn) => {
      record.push(fn(this));
    });
    // Obtain record length
    if(this.options.objectMode){
      recordLength = 0;
      // recordLength is currently equal to the number of columns
      // This is wrong and shall equal to 1 record only
      for(const column of record)
        recordLength += column.length;
    }else {
      // Stringify the record
      record = (this._.count_created === 0 ? '' : this.options.rowDelimiter)+record.join(this.options.delimiter);
      recordLength = record.length;
    }
    this._.count_created++;
    if(length + recordLength > size){
      if(this.options.objectMode){
        data.push(record);
        for(const record of data){
          this.__push(record);
        }
      }else {
        if(this.options.fixedSize){
          this._.fixed_size_buffer = record.substr(size - length);
          data.push(record.substr(0, size - length));
        }else {
          data.push(record);
        }
        this.__push(data.join(''));
      }
      return;
    }
    length += recordLength;
    data.push(record);
  }
};
// Put new data into the read queue.
Generator.prototype.__push = function(record){
  const push = () => {
    this._.count_written++;
    this.push(record);
    if(this._.end === true){
      return this.push(null);
    }
  };
  this.options.sleep > 0 ? setTimeout(push, this.options.sleep) : push();
};
// Generate an ASCII value.
Generator.ascii = function(gen){
  // Column
  const column = [];
  const nb_chars = Math.ceil(gen.random() * gen.options.maxWordLength);
  for(let i=0; i<nb_chars; i++){
    const char = Math.floor(gen.random() * 32);
    column.push(String.fromCharCode(char + (char < 16 ? 65 : 97 - 16)));
  }
  return column.join('');
};
// Generate an integer value.
Generator.int = function(gen){
  return Math.floor(gen.random() * Math.pow(2, 52));
};
// Generate an boolean value.
Generator.bool = function(gen){
  return Math.floor(gen.random() * 2);
};
// Camelize option properties
Generator.camelize = function(str){
  return str.replace(/_([a-z])/gi, function(_, match){
    return match.toUpperCase();
  });
};

const generate = function(options){
  if(typeof options === 'string' && /\d+/.test(options)){
    options = parseInt(options);
  }
  if(Number.isInteger(options)){
    options = {length: options};
  }else if(typeof options !== 'object' || options === null){
    throw Error('Invalid Argument: options must be an object or an integer');
  }
  if(!Number.isInteger(options.length)){
    throw Error('Invalid Argument: length is not defined');
  }
  const chunks = [];
  let work = true;
  // See https://nodejs.org/api/stream.html#stream_new_stream_readable_options
  options.highWaterMark = options.objectMode ? 16 : 16384;
  const generator = new Generator(options);
  generator.push = function(chunk){
    if(chunk === null){
      return work = false; 
    }
    if(options.objectMode){
      chunks.push(chunk);
    }else {
      chunks.push(chunk);  
    }
  };
  while(work){
    generator._read(options.highWaterMark);
  }
  if(!options.objectMode){
    return chunks.join('');
  }else {
    return chunks;
  }
};

exports.generate = generate;
