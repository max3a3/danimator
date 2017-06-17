/** 
 * Main animation engine 
 */

/* check of dependencies */
var missing;
try {
	missing = 'lodash'; 	_.VERSION;
	missing = 'jQuery'; 	jQuery();
} catch(e) {
	throw new ReferenceError(missing + ' required!');
}

var animations = [];

/* create Danimator as main object and, at the same time, as shortcut to Danimator.animate */
if(!this.Danimator) {
	Danimator = function Danimator() { return Danimator.animate.apply(Danimator, arguments); };
}

Danimator._time = 0;

/* adding time getter/setter to Danimator */
Object.defineProperty(Danimator, 'time', {
  get: function()     { return Danimator._time },
  set: function(secs) {
  	Danimator._time = Math.max(secs, 0);						// limit seconds to positive value
  	if(Danimator.onTimeChanged) Danimator.onTimeChanged(Danimator._time);		// call global hook everytime time gets changed
  	return Danimator;
  }
});

/* retrieve sceneElement from DOM element, jQuery element, Paper.js item or Danimator sceneElement */
Danimator.sceneElement = function danimatorSceneElement(element) {
	if(element.$element) return element;
	if(element instanceof jQuery) return element.data('sceneElement');
	if(element instanceof HTMLElement) return $(element).data('sceneElement');
	return _.get(element, 'data.sceneElement');
}

/** 
 * data helper: limit number between two boundarie
 * – like _.clamp except it accepts upper and lower border in arbitrary order 
 * @example: Danimator.limit(5, 10, 0) will return 5 while _.clamp(5, 10, 0) will return 10.
 */
Danimator.limit = function(nr, mi, ma) {
	if(mi > ma) {
		var tweener = mi + 0;
		mi = ma + 0;
		ma = tweener + 0;
		delete tweener;
	}
	return Math.max(Math.min(nr, ma), mi);
}

/* initializes a Danimator scene from the passed item and creates index of symbol defs */
Danimator.init = function danimatorInit(item) {
	item.data.sceneRoot = true;
	item.name = 'scene';

	/* prep work: create scene abstraction off of imported item */
	paper.scene = _createDanimatorScene(item);

	// add empty (non-enumerable) symbols array to scene
	Object.defineProperty(paper.scene, 'symbols', { enumerable: false, 
		value: 	[] 
	});

	if(Danimator.removeClip) {				// if removeClip option is set to true (default)
		if(item.firstChild.clipMask) {		// and the first child of the scene is a clipping mask
			item.firstChild.remove();		// remove it!
		}
	}

	/* collect all symbols as name:symbol map under paper.scene.symbols */
	_.each(paper.project.symbolDefinitions, function(definition) {
		if(definition.item.name)
			paper.scene.symbols[definition.item.name] = definition;
	});
}

/* imports an SVG using Paper.js and turns it into a Danimator sceneElement */
Danimator.import = function DanimatorImport(svgPath, optionsOrOnLoad) {
	var _options = {};
	var _onLoad;

	if(typeof optionsOrOnLoad === 'object') {		// if second argument is a map
		_options = optionsOrOnLoad;
		_onLoad = optionsOrOnLoad.onLoad;
	} else {										// if second argument is a function
		_onLoad = optionsOrOnLoad;
	}

	_options.onLoad = function(item, svg) {
		paper.$dom = $(svg);
		
		Danimator.init(item);

		_onLoad && _onLoad.call(paper.scene);
	};

	paper.project.importSVG.call(paper.project, svgPath, _options);
}

/* load animations from external json */
Danimator.load = function danimatorLoad(aniName) {
	var filename = aniName + '.ani.json';

	$.getJSON(filename, null, function(json, status) {
		if(status === 'success') {
			_.each(json, function(animatable, id) {
				if(!isNaN(Number(id))) id = Number(id);
				var item = paper.project.getItem({id: id});

				if(item) 
					_.each(animatable.properties, function(tracks, prop) {
						_.each(tracks, function(track) {
							Danimator.animate(item, prop, track.from, track.to, track.duration, track.options);
						})
					});
			})
		} else {
			console.warn('Animations "' + filename + '" couldn\'t be loaded :(');
		}
	}).fail(function(promise, type, error){ console.error(error); });
}

/* calculate single step of animation */
Danimator.step = function danimatorStep(animatable, progress) {
	var value = _.get(animatable.item, animatable.property);

	if(animatable.from == undefined) 		animatable.from = value;

	if(typeof animatable.to === 'string') {		// if animatable.to is a String
		if(!isNaN(animatable.to)) {				// yet contains a number
			animatable.to = animatable.from + Number(animatable.to); 	// increment by that number instead
		}
	}

	var ascending = animatable.to > animatable.from;	// check whether values are animated ascending or descending
	var range 	  = animatable.to - animatable.from;	// calculate range of animation values
	var isDone 	  = ascending ? 
					value >= animatable.to : 
					value <= animatable.to;
	var newValue;

	if(Danimator.interactive) {
		isDone = false;
	}

	if(isDone) {
		if(animatable.property === 'frame')
			animatable.item.data._playing = false;
	} else {
		if(animatable.options.easing) {
			/* Easing requires easing.js to be loaded, too */
			try {
				var easing = (typeof animatable.options.easing === 'string' ? Ease[animatable.options.easing] : animatable.options.easing);
				if(easing) {
					progress = easing(progress);
				}
			} catch(e) {
				console.warn('Easing helpers not loaded!');
			}
		}

		if(typeof animatable.from === 'string') {
			if(progress >= 1) {
				newValue = animatable.to;
				isDone = Danimator.interactive;
			} else {
				newValue = animatable.from;
			}
		} else {
			/* calculate new value and limit to "from" and "to" */
			newValue = Danimator.limit(animatable.from + (range * progress), animatable.from, animatable.to);
		}

		/* animatable onStep hook to intervene on every step */
		if(animatable.options.onStep) {
			newValue = animatable.options.onStep(newValue, progress, animatable);
		}

		_.set(animatable.item, animatable.property, newValue);

		// if we're animating a state force update by reassigning to itself (setState being called again)
		if(animatable.property.match(/^state\.?/g)) {
			animatable.item.state = animatable.item.state;
		}

		/* force-updating canvas drawing */
		paper.project.view.requestUpdate();
	}

	/* global onStep hook to intervene on every step of every animation */
	if(Danimator.onStep) Danimator.onStep(animatable, newValue);

	return {
		done: 	isDone,
		value: 	newValue
	};
}

/* core animation function (adds animation to animatable stack) */
Danimator.animate = function danimatorAnimate(item, property, fr, to, duration, options) {
	if(!_animateFrame) {
		/* create _animateFrame function to be executed every item.onFrame() */
		function _animateFrame(event) {
			var item = this;

			/* walk thru array of props to animate */
			_.each(item.data._animate, function(animatable) {
				if(animatable) {
					/* calculate current progress of animation (0…1) */
					var t = ((new Date).getTime() - (animatable.startTime || 0)) / (animatable.duration * 1000);
					var animation = Danimator.step(animatable, t);		// retrieve map with calculated step value and "done" flag
					var range 	  = Math.abs(animatable.to - animatable.from);

					if(animation.done) {
						/* remove animatable entry from said animate array */
						_.pull(item.data._animate, animatable);

						if(!item.data._animate.length) {
							/* remove frame handler from item and remove array */
							item.off('frame', _animateFrame);
							delete item.data._animate;
						}

						/* if onDone parameter provided as String */
						if(animatable.options.onDone) { 
							if(typeof animatable.options.onDone === 'string') {
								if(animatable.property === 'frame') {
									animatable.item.data._playing = true;
									/* calculate timing of animation iteration for frame-animations */
									animatable.options.delay = animatable.to === 1 ? 0 : animatable.duration / range;
								} 

								switch(animatable.options.onDone) {
									case 'reverse':
										/* turning looping off so it can behave like pingpong without loops */
										delete animatable.options.onDone;
									case 'pingpong':
										/* switch out from and to and then fall into normal loop behavior (no break) */
										var xfer = _.clone(animatable.to);
										animatable.to = _.clone(animatable.from);
										animatable.from = xfer;
									default: // loop
										if(!animatable.item.data._loops) animatable.item.data._loops = 0;
										/* handler to execute every loop: onLoop(numberOfLoops) */
										if(animatable.options.onLoop) animatable.options.onLoop(animatable, animatable.item.data._loops++ );
										return Danimator.animate(animatable.item, animatable.property, animatable.from, animatable.to, animatable.duration, animatable.options);
								}
							} else {
								animatable.options.onDone && animatable.options.onDone(animatable);
							}

						}
					}
				}
			})
		}
	}

	// ### TODO: change initVal here if necessary
	/* setTimeout to cover delay parameter */
	var aniTimeout = animations[item.id] = setTimeout(function() {
		/* if this is the first time */
		if(!item.data._animate) {
			/* attach animatables array and frameHandler to item */
			item.data._animate = [];
			item.on('frame', _animateFrame);
		}

		var ease = (property === 'frame' ? null : 'cubicOut');	// default easing is cubicOut (or none for frame animations)
		/* animatables are the base of everything animated thru Danimator. They describe animations and come in pairs of keyframes to the editor */
		var animatable = {
			item: 		item,
			property: 	property || 'opacity',
			duration: 	duration || 1,
			from: 		fr,
			to: 		to !== undefined ? to : 1,
			startTime: 	(new Date).getTime(),
			options: 	_.defaults(options, { delay: 0, easing: ease })
		};

		if(fr !== null) _.set(item, animatable.property, fr);	// if "from" is set use it to initialize the item
		item.data._animate.push(animatable);					// and add animatable to item's new array

	}, ((options && options.delay) || 0) * 1000);				// delay is in seconds, so we turn into ms

	if(Danimator.onAnimate) Danimator.onAnimate();				// call hook if there is one

	/* return handles for easier chaining of animations */
	return {
		options: options,
		then: 	 Danimator.then,
		stop: 	function() {
					clearTimeout(aniTimeout);
				}
	};
}

/* basic frame animation support */
Danimator.play = function danimatorPlay(item, options) {
	var frames = item.frames;
	var range  = frames - item.frame;
	var duration = range / (options && options.fps || 12);	// calculate duration from fps and number of available frames

	item.data._playing = true;
	options.frameDuration = duration / range;				// calculating duration of single frame and passing it on for later reference

	return Danimator(item, 'frame', item.frame, frames, duration, options);
}

/* interrupt frame animations */
Danimator.stop = function danimatorStop(item) {
	item.data._playing = false;
}

/* stop all animations on passed item */
Danimator.stopAll = function danimatorStopAll(item) {
	_.each(animations[item.id], function(ani, id){
		clearTimeout(ani);
		delete animations[id];
	});
	item.data._playing = false;
	delete item.data._animate;
};


/**
* like .animate() except .then() one waits for the last animation to complete. 
* First argument is the animation method as String: "animate|fadeIn|fadeOut|morph|…"
*/
Danimator.then = function danimatorThen() {
	var args = _.toArray(arguments);
	var action = args.shift();
	var newOptions = _.last(args);

	newOptions.delay = _.get(newOptions, 'delay', 0) + ((this.options && this.options.delay) || 0);

	return Danimator[action].apply(this, args);
}

/* fx */
Danimator.fadeIn = function danimatorFadeIn(item, duration, options) {
	var fromv = options && options.from;
	if(fromv !== undefined) {
		item.opacity = fromv;
		delete options.from;
	} else fromv = null;
	item.visible = true;
	return Danimator(item, 'opacity', fromv, _.get(options, 'to', 1), duration, options);
};
Danimator.fadeOut = function danimatorFadeOut(item, duration, options) {
	var fromv = options && options.from;
	if(fromv !== undefined) {
		item.opacity = fromv;
		delete options.from;
	} else fromv = null;
	item.visible = true;
	return Danimator(item, 'opacity', fromv, _.get(options, 'to', 0), duration, options);
};

/* morph between two shapes (works for subitems too) */
Danimator.morph = function danimatorMorph(fromItem, toItem, duration, options) {
	var fromItems = [fromItem];
	var toItems   = [toItem];

	var newItem   = fromItem.clone();	// clone fromItem so we don't have to touch the originals
	var newItems  = [newItem];

	/* if passed elements aren't paths gather all child paths */
	if(fromItem.className !== 'Path') {
		fromItems = fromItem.getItems({	class: paper.Path});
		toItems   = toItem.getItems({ 	class: paper.Path});
		newItems  = newItem.getItems({ 	class: paper.Path});
	}

	fromItem.visible = toItem.visible = false;
	/* use cleaned out names to create name of morphed item ("newItem") */
	newItem.name = 'morph "' + fromItem.name.replace(/(^_|\-\d+$)/g, '') + '" to "' + toItem.name.replace(/(^_|\-\d+$)/g, '') + '"';
	newItem.insertAbove(fromItem);
	/* initialize property to be animated: */
	newItem.data.morphing = 0;

	/* global hook for morphing */
	if(Danimator.onMorph) Danimator.onMorph(newItem, options);

	/* start normal animate call from 0 to 1 and hook into onStep */
	Danimator(newItem, 'data.morphing', 0, 1, duration, {
		onStep: function(progress) {
			if(progress === 0 || progress === 1) {				// if at beginning or end of animation
				[fromItem, toItem][progress].visible = true;	// show either fromItem or toItem, consecutively
				newItem.visible = false;						// hide the temporary morphed clone
			} else {
				fromItem.visible = toItem.visible = false;
				newItem.visible = true;

				_.each(fromItems, function(fromPath, key) {					// for every path …
					var toPath  = toItems[key];
					var newPath = newItems[key];

					_.each(newPath.segments, function(segment, index) {		// and every segment …
						var fromSegment = fromPath.segments[index];
						var toSegment 	= toPath.segments[index];

						/* calculate and apply new position and tangents of segments */
						if(segment && toSegment) {
							segment.point = 	fromSegment.point.add( 		toSegment.point.subtract( 		fromSegment.point ).multiply(progress) );
							segment.handleIn = 	fromSegment.handleIn.add( 	toSegment.handleIn.subtract( 	fromSegment.handleIn ).multiply(progress) );
							segment.handleOut = fromSegment.handleOut.add( 	toSegment.handleOut.subtract( 	fromSegment.handleOut ).multiply(progress) );
						}
					});
				});
			}
		}
	});
}

/* sound factory */
Danimator.sound = function danimatorSound(name, options) {
	var config 	= _.extend({ 
		name: 	name, 
		src: 	['audio/' + name] 
	}, options);
	var sound  	= _.get(Danimator.sounds, name);
	var fadeIn 	= 0;
	var fadeOut = 0;

	/* add default path (audio/) + file extension (m4a) if not supplied */
	config.src = _.map(config.src, function(src) {
		if(!src.match(/^\/?audio\/.+$/g)) {
			src = 'audio/' + src;
		}
		if(!src.match(/.*\.[^\.]+$/g)) {
			name += '.m4a';
			return src + '.m4a';
		}
		return src;
	});

	if(config.fadeIn) {
		fadeIn = config.fadeIn;
		delete config.fadeIn;
	}
	if(config.fadeOut) {
		fadeOut = config.fadeOut;
		delete config.fadeOut;
	}

	if(!sound) {
		/* generate new sound handler */
		sound = Danimator.sounds[name] = {
			source: new Howl(config),
			get: function(param) {
				return this.source['_' + param];
			},
			set: function(param, value) {
				this.source[param](value, this.instance);
			},
			play: function() {
				this.stopped = false;
				Danimator._activeSound = this;
				return this.instance = this.source.play();
			},
			stop: function() {
				this.source.stop(this.instance);
				this.stopped = true;
				/* global hook for stopping of sound */
				if(Danimator.onSoundStop) Danimator.onSoundStop(this);
			},
			fadeIn: function(duration) {
				var volume = this.source.volume(null, this.instance);
				this.source.fade(0, volume, duration, this.instance);
				return volume;
			},
			fadeOut: function(duration) {
				var volume = this.source.volume(null, this.instance);
				this.source.fade(volume, 0, duration, this.instance);
				return volume;
			}
		};
	}
	
	sound.options = options;
	// save who called this method
	sound.caller = danimatorSound.caller.name;

	/* account for delay param */
	setTimeout(function danimatorSound() {
		if(!Danimator.interactive) {
			sound.play();
			
			if(fadeIn) {
				sound.fadeIn(fadeIn);
			}
			if(fadeOut) {
				sound.fadeOut(fadeOut);
			}
		} else {
			Danimator._activeSound = sound;
		}

		if(Danimator.onSound) {
			/* global hook for starting of sound */
			Danimator.onSound(name, sound);
		}
	}, _.get(options, 'delay', 0));

	return sound;
};

var _createDanimatorScene = function(parent) {
	var tree = {
		className: 'sceneElement'
	};

	// save (non-enumerable) reference to Paper.js item
	Object.defineProperty(tree, 'item', { enumerable: false, writable: false, configurable: false, 
		value: 	parent 
	});

	// add (non-enumerable) data holder
	Object.defineProperty(tree, 'data', { enumerable: false,
		value: 	{}
	});
	
	// helper to find elements within other elements by name given in Illustrator (ignoring naming convention used in SVG)
	Object.defineProperty(tree, 'find', { enumerable: false, writable: false, configurable: false, 
		value: 	function(selector) {
					// find in DOM by data-name, which is the attrib Illustrator saves the original layer names in
					var $doms = this.$element.find('[data-name="' + selector + '"],#' + selector);
					return $doms.map(function() {
						// and map to their according scene element rather than DOM elements
						var element = $(this).data('sceneElement');
						if(!element) {
							var item = paper.project.getItem({ name: selector });
							element = item.data.sceneElement = _createDanimatorScene(item);
							$(this).data('sceneElement', element);
						}
						return element;
					}).get();
				}
	});

	// (non-enumerable) getter to retrieve children as disassociative array
	Object.defineProperty(tree, 'ordered', { enumerable: false,
		get: function() {
			return _.values(this);
		}
	});

	// save (non-enumerable) reference to DOM element
	if(parent.name) {
		Object.defineProperty(tree, '$element', { enumerable: false, writable: false, configurable: false, 
			value: 	parent.data.sceneRoot ? paper.$dom : paper.$dom.find('#' + parent.name)
		});
	}

	if(parent.children)
		_.each(parent.children, function(child, childId) {

			if(!child.name) {
				child.name = 'element_' + child.id;
				tree.$element.children(':eq(' + childId + ')').attr('id', child.name);
			}

			var $element = paper.$dom.find('#' + child.name);
			var branch = _createDanimatorScene(child);

			var originalName = String($element.data('name') || child.name);
			var frameMatch;

			// state detected!
			if(originalName[0] === '#') {
				if(!parent.data._states) parent.data._states = {};

				originalName = originalName.slice(1);
				parent.data._states[originalName] = child;

				if(_.size(parent.data._states) > 1) { 
					child.visible = false;
				} else {
					parent.data._state = parent.data._state || originalName;
				}
			// frame detected!
			} else if(frameMatch = originalName.match(/^f(\d+)/)) {
				var frame = parseInt(Number(frameMatch[1]));
				parent.data._frames = Math.max(parent.data._frames || 1, frame);
				if(frame > 1) child.visible = false;
			}

			$element.data('sceneElement', branch);
			
			tree[originalName] = branch;

			child.data.sceneElement = branch;
		});
	return tree;
};

/* Paper.js injections */
paper.Item.inject({
	/* frame animation capability for Paper.js Items */
	getFrame: function() {
		if(!this.data._frame) {
			this.data._frame = 1;
		}
		return this.data._frame;
	},
	setFrame: function(nr) {
		var frame 		 = parseInt(nr);
		var element 	 = Danimator.sceneElement(this);
		/* find child layer called "f1" (or using the according presaved frame number) */
		var currentFrame = element['f' + this.getFrame()] || this.data._frameLayer;
		var newFrame 	 = element['f' + Danimator.limit(frame, 0, this.frames)] || this.data._frameLayer;

		/* if we have a currentFrame */
		if(currentFrame) {
			this.data._frameLayer = currentFrame;
			currentFrame.item.visible = false;
		}

		if(newFrame) {
			newFrame.item.visible = true;
		}
		this.data._frame = frame;

		if(!_.isEmpty(this.state)) {
			this.state = this.state;
		}

		this.data.onFrameChanged && this.data.onFrameChanged(frame);
	},
	/* get all children's frame numbers and return the highest one */
	getFrames: function() {
		return this.data._frames || 1;
	},
	/* state capability – switch visibility of children layers on and off using meaningful labels */
	getState: function() {
		// accept childname as first argument (but do it in hindsight for Paper.js to pickup getter and setter properly)
		if(typeof arguments[0] === 'string') {
			return _.get(this.data, '_state.' + arguments[0], false);
		}
		return this.data._state || {};
	},
	// example: bear.state = 'snout.open';
	// 			will show layer #open of bear's childrens starting with "snout" (so snout-1, snout-2, …) 
	// 			and hide all its siblings
	setState: function(state) {
		var self = this;
		var childname;

		if(typeof state === 'object') {
			return _.each(state, function(currentState, name) {
				self.setState(name + '.' + currentState);
			});
		}

		// if this is the state of a subelement
		if(state.indexOf('.') > -1) {
			state = state.split('.');
			childname = state[0] + '';
			state = state.slice(1).join('.');
		}

		if(childname) {
			self.data._state = self.data._state || {};
			self.data._state[childname] = state;

			var element = Danimator.sceneElement(self);
			var parent;

			if(self.frames === 1) {										// if we don't have several frames
				parent = element;										// search the whole element
			} else {
				parent = element['f' + self.frame];						// otherwise narrow search down to current frame for better performance
			}

			return _.each(parent.find(childname), function(child) {
						child.item.setState(state);						// and change their state
					});
		} else {
			var states = self.getStates();								// retrieve all states

			if(self.data._state === undefined) {
				self.data._state = _.keys(states)[0];					// set default state to first key of states object
			} 

			states[self.data._state].visible = false;					// hide current state 
			states[state].visible = true;								// and show newly set state instead
			self.data._state = state;
		}
		self.data.onStateChanged && self.data.onStateChanged(state, childname);
		return self;
	},
	/* retrieve all states of an item */
	getStates: function() {
		return _.get(this.data, '_states', {});
	},
});

/* init values for Danimator props */
Danimator.sounds 		= {};
Danimator.interactive 	= false;					// interactive mode suppresses checks of animationEnd and thus never removes them from stack
Danimator.startTime 	= (new Date).getTime();		// when did Danimator get initialized?
Danimator.removeClip 	= true;						// if there's a clipping mask on the whole scene auto-remove it

var _scriptQuery = _.last(document.getElementsByTagName('script')).src.replace(/^[^\?]+\??/,'');