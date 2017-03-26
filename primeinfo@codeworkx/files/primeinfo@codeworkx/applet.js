const St = imports.gi.St;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const Mainloop = imports.mainloop;
const Applet = imports.ui.applet;
const Gettext = imports.gettext.domain('cinnamon-applets');
const _ = Gettext.gettext;

function MyApplet(orientation) {
    this._init(orientation);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation) {
        Applet.TextApplet.prototype._init.call(this, orientation);

        this.lang = {
            'acpi' : 'ACPI Adapter',
            'pci' : 'PCI Adapter',
            'virt' : 'Virtual Thermal Zone'
        };

        this.statusLabel = new St.Label({
            text: "--",
            style_class: "temperature-label"
        });

        try {
            // Create the popup menu
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.sensorsPath = this._detectSensors();

            if (this.sensorsPath) {
                this.title='Error';
                this.content='Run sensors-detect as root.';
            } else {
                this.title='Warning';
                this.content='Please install lm_sensors.';
            }

            this.set_applet_tooltip(_("ASUS Prime-X370 PRO Info"))
            this._update_temp();
        } catch (e) {
            global.logError(e);
        }
     },

    on_applet_clicked: function(event) {
        this.menu.toggle();
    },
    
    _detectSensors: function(){
        let ret = GLib.spawn_command_line_sync("which sensors");
        if ((ret[0]) && (ret[3] == 0)) {
            return ret[1].toString().split("\n", 1)[0];
        }
        return null;
    },

    _update_temp: function() {
        let items = new Array();
        let sensorsInfo = null;
        if (this.sensorsPath) {
            let sensors_output = GLib.spawn_command_line_sync(this.sensorsPath);
            
            if (sensors_output[0]) {
                sensorsInfo = this._findSensorsValues(sensors_output[1].toString());
            }
            
            if (sensorsInfo) {
                var s="", n=0;
                for (let adapter in sensorsInfo) {
                    if (adapter != 0) {
                        //ISA Adapters
                        if (adapter=='isa') {
                            for (let adanum in sensorsInfo[adapter]) {

                                items.push("ISA Adapter " + adanum);
                                items.push("--------------------");
                                items.push("Temperatures");

                                for (let sensname in sensorsInfo[adapter][adanum]) {
                                    if (sensorsInfo[adapter][adanum][sensname]['temp'] > 0) {
                                        if (sensname == 'CPU Temp') {
                                            s += this._formatTemp(sensorsInfo[adapter][adanum][sensname]['temp']) + " ";
                                            n++;
                                        }
                                        items.push(sensname + ': ' + this._formatTemp(sensorsInfo[adapter][adanum][sensname]['temp']));
                                    }
                                }

                                items.push(" ");
                                items.push("Voltages");

                                for (let sensname in sensorsInfo[adapter][adanum]) {
                                    if (sensorsInfo[adapter][adanum][sensname]['voltage'] > 0) {
                                        if (sensname == 'VCore') {
                                            s += this._formatVoltage(sensorsInfo[adapter][adanum][sensname]['voltage']) + " ";
                                            n++;
                                        }
                                        items.push(sensname + ': ' + this._formatVoltage(sensorsInfo[adapter][adanum][sensname]['voltage']));
                                    }
                                }

                                items.push(" ");
                                items.push("Fans");

                                for (let sensname in sensorsInfo[adapter][adanum]) {
                                    if (sensorsInfo[adapter][adanum][sensname]['speed'] > 0) {
                                        if (sensname == 'CPU Fan 1') {
                                            s += this._formatSpeed(sensorsInfo[adapter][adanum][sensname]['speed']) + " ";
                                            n++;
                                        }
                                        items.push(sensname + ': ' + this._formatSpeed(sensorsInfo[adapter][adanum][sensname]['speed']));
                                    }
                                }
                            }
                        }
                    }
                }

                if (n != 0) {
                    this.title = s;
                }
            }
        }

        this.set_applet_label(this.title);

        this.menu.box.get_children().forEach(function(c) {
            c.destroy()
        });

        let section = new PopupMenu.PopupMenuSection("PrimeInfo");
        if (items.length > 0) {
            let item;
            for each (let itemText in items) {
                item = new PopupMenu.PopupMenuItem("");
                item.addActor(new St.Label({
                    text:itemText,
                    style_class: "sm-label"
                }));
                section.addMenuItem(item);
            }
        } else {
            let command=this.command;
            let item = new PopupMenu.PopupMenuItem("");
            item.addActor(new St.Label({
                text:this.content,
                style_class: "sm-label"
            }));
            item.connect('activate',function() {
                Util.spawn(command);
            });
            section.addMenuItem(item);
        }
        this.menu.addMenuItem(section);

        // update every second
        Mainloop.timeout_add(1000, Lang.bind(this, this._update_temp));
    },

    _createSectionForText: function(txt) {
        let section = new PopupMenu.PopupMenuSection("PrimeInfo");
        let item = new PopupMenu.PopupMenuItem("");
        item.addActor(new St.Label({
            text:txt,
            style_class: "sm-label"
        }));
        section.addMenuItem(item);
        return section;
    },

    _findSensorsValues: function(txt) {
        let senses_lines=txt.split("\n");
        let line = '';
        let type = '';
        let s= new Array();
        s['isa'] = new Array();
        let n=0,c=0;
        let f;
        let k;

        for(let i = 0; i < senses_lines.length; i++) {
            line = senses_lines[i];

            switch (line.substr(0, 6)) {
                case 'it8665':
                    f=0;
                    for (let j=i+2;;j++,i++) {
                        if (senses_lines[j] && !this._isAdapter(senses_lines[j])) {
                            if (!f++) {
                                s['isa'][++n]=new Array();
                            }

                            senses_lines[j]=senses_lines[j].replace(/\s/g, "");

                            if (this._startsWith(senses_lines[j], 'in0:')) {
                                k = 'VCore';
                                // in0:+1.16V(min=+2.74V,max=+2.78V)
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['voltage']=parseFloat(senses_lines[j].substr(4,5));
                                s['isa'][n][k]['min']=this._getMin(senses_lines[j]);
                                s['isa'][n][k]['max']=this._getMax(senses_lines[j]);
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'in1:')) {
                                k = 'VCCP2';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['voltage']=parseFloat(senses_lines[j].substr(4,5));
                                s['isa'][n][k]['min']=this._getMin(senses_lines[j]);
                                s['isa'][n][k]['max']=this._getMax(senses_lines[j]);
                                c++;
                            } else if (this._startsWith(senses_lines[j], '+12V:')) {
                                k = '+12V';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['voltage']=parseFloat(senses_lines[j].substr(4,5));
                                s['isa'][n][k]['min']=this._getMin(senses_lines[j]);
                                s['isa'][n][k]['max']=this._getMax(senses_lines[j]);
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'temp1:')) {
                                k = 'CPU Temp';
                                // temp1:+33.0C(low=-2.0C,high=-11.0C)sensor=thermistor
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['temp']=parseFloat(senses_lines[j].substr(6,5));
                                s['isa'][n][k]['low']=this._getLow(senses_lines[j]);
                                s['isa'][n][k]['high']=this._getHigh(senses_lines[j]);
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'temp2:')) {
                                k = 'MB Temp';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['temp']=parseFloat(senses_lines[j].substr(6,5));
                                s['isa'][n][k]['low']=this._getLow(senses_lines[j]);
                                s['isa'][n][k]['high']=this._getHigh(senses_lines[j]);
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'temp3:')) {
                                k = 'PCH Temp';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['temp']=parseFloat(senses_lines[j].substr(6,5));
                                s['isa'][n][k]['low']=this._getLow(senses_lines[j]);
                                s['isa'][n][k]['high']=this._getHigh(senses_lines[j]);
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'fan1:')) {
                                k = 'CPU Fan 1';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['speed']=parseInt(senses_lines[j].substr(5,4));
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'fan2:')) {
                                k = 'CPU Fan Opt';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['speed']=parseInt(senses_lines[j].substr(5,4));
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'fan3:')) {
                                k = 'Chassis Fan 1';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['speed']=parseInt(senses_lines[j].substr(5,4));
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'fan5:')) {
                                k = 'AIO Pump';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['speed']=parseInt(senses_lines[j].substr(5,4));
                                c++;
                            } else if (this._startsWith(senses_lines[j], 'fan6:')) {
                                k = 'Chassis Fan 2';
                                s['isa'][n][k]=new Array();
                                s['isa'][n][k]['speed']=parseInt(senses_lines[j].substr(5,4));
                                c++;
                            }
                        } else {
                            break;
                        }
                    }
                    break;
                default:
                    break;
            }
        }
        return s;
    },

    _startsWith: function (haystack, needle) {
        if (haystack.lastIndexOf(needle, 0) === 0) {
            return true;
        }
        return false;
    },

    _isAdapter: function (line) {
        if (line.substr(0, 8)=='Adapter:') {
            return true;
        }
        return false;
    },

    _getMin: function(t) {
        let r;
        return (r=/min=\+(\d{1,3}.\d)/.exec(t))?parseFloat(r[1]):null;
    },

    _getMax: function(t) {
        let r;
        return (r=/max=\+(\d{1,3}.\d)/.exec(t))?parseFloat(r[1]):null;
    },

    _getLow: function(t) {
        let r;
        return (r=/low=\+(\d{1,3}.\d)/.exec(t))?parseFloat(r[1]):null;
    },

    _getHigh: function(t) {
        let r;
        return (r=/high=\+(\d{1,3}.\d)/.exec(t))?parseFloat(r[1]):null;
    },

    _getCrit: function(t) {
        let r;
        return (r=/crit=\+(\d{1,3}.\d)/.exec(t))?parseFloat(r[1]):null;
    },

    _getHyst: function(t) {
        let r;
        return (r=/hyst=\+(\d{1,3}.\d)/.exec(t))?parseFloat(r[1]):null;
    },

    _toFahrenheit: function(c) {
        return ((9/5)*c+32).toFixed(1);
    },

    _getContent: function(c) {
        return c.toString()+"\u1d3cC / "+this._toFahrenheit(c).toString()+"\u1d3cF";
    },

    _formatTemp: function(t) {
        //uncomment the next line to display temperature in Fahrenheit
        //return this._toFahrenheit(t).toString()+"\u1d3cF";
        return (Math.round(t*10)/10).toFixed(1).toString() + " \u1d3cC";
    },

    _formatVoltage: function(t) {
        return t + " V";
    },

    _formatSpeed: function(t) {
        return t + " RPM";
    }
}

// for debugging
function debug(a){
    global.log(a);
    Util.spawn(['echo',a]);
}

function main(metadata, orientation) {
    let myApplet = new MyApplet(orientation);
    return myApplet;
}
