# Danimator.js
Advanced scalable vector graphics animations/interactions based on Paper.js

![scr-danimator-examples-1](https://user-images.githubusercontent.com/8395474/27254790-489d37b6-5390-11e7-89e2-8a3765e140e5.gif)

## The What and the Why

Paper.js is great for interactive manipulation of paths, but it becomes tiresome when it comes to organic animations.
Danimator solves that by providing intuitive abstractions to both [time- and frame-based animations](#), [shape morphing](#), [blazing fast DOM traversal](#), [sound creation](#), and much more.
Let's bring back the power of proper vector animations to the browser!

## Quick Start

Start by importing an **SVG** like so:
```js
Danimator.import(svg, options);
```
This will use [Paper.js to parse the SVG to canvas](http://paperjs.org/reference/project/#importsvg-svg), rename the imported group to [`scene`](#scene), and create a [`SceneElement`](#sceneelement) for it. The second parameter accepts a map with an _onLoad_ property to be executed once the SVG has been imported. You can also pass the callback directly as second param. onLoad will retrieve the parsed [scene](#scene) as parameter.
```js
Danimator.import(svg, (scene) => scene.bear.item.strokeColor = 'yellow');
```
This scene will also store all named symbolDefinitions inside its property `.symbols`.

## The Basics

### scene
The scene contains all named SVG items as nested properties.
This means that if you have an SVG with a group named `bear` containing a path called `snout`, you can access it like this: 
```js
scene.bear.snout
```
To change the opacity of `snout`'s [Paper.js item](http://paperjs.org/reference/item/), you'd do:
```js
scene.bear.snout.item.opacity = 0.5;
```
You can access scene elements using their according names, but use `.ordered` if you need to access them numerically:
```js
scene.bear.ordered[0];  // this will access bear's first child
```
This setup also walks thru all SVG elements, [normalizes their names](#normalized-element-names), and hides all detected [states](#states) and [frames](#frames) except for the first one.


### SceneElement
sceneElements store two representations that can be accessed as properties:

property | description
-|-
**.item** | Reference to the rendered [Paper.js item](http://paperjs.org/reference/item/)
**.$element** | Reference to the jQuery element of the SVG as parsed DOM

____
Both `item` and `$element` have references to this `SceneElement` in their data property.

element | access to SceneElement
-|-
item | **.data.sceneElement**
$element | **.data('sceneElement')**

____
… but you can always just use the helper method `Danimator.sceneElement( anyItem )` to retrieve its according `sceneElement` (if one exists)
____

SceneElement **.find** is a helper to find deeply nested elements within elements:
 ```js
scene.bear.find("eyebrow-left").visible = false;
```

Every SceneElement has a data store for easy data passing between jQuery elements and items inside PaperScript:
```js
scene.bear.data.hungriness = 0.8;
```


### Normalized Element Names
Illustrator generates a unique id for each element when exporting to SVG. This means that while the two elements named "dog" and "cat" each have a subelement named "nose" in Illustrator, the exported SVG will have one of them contain a "nose_1" or "nose_2" for the sake of unique names. This makes selecting elements by name cumbersome. Danimator **normalizes** those names back to what they were, and lets you choose which one to use ("nose" will return all elements originally named "nose", while "nose_2" will only select that one specific one).

## Animating

### Animation options
All animation methods accept an options map as last parameter. You may configure the following options:

option | data type | description | example
-|-|-|-
delay | _Number_ | How long to wait before starting the animation (in s) | 2
onStep | _Function_ | Callback to be run on every step of the animation. Takes one parameter `time` to apply a filter to the progress (0 to 1) of the animation by returning the new value. | onStep: (t) => t * 2 	      	`// 2x speed!`
onDone | _Function_ or _String_ | Callback to be run once the animation is done. Use one of the strings "reverse", "loop", or "pingpong" to repeat the animation automatically. | "reverse"
onLoop | _Function_ | If you supplied a String to onDone, this provides a callback for every iteration of a loop | -

### Danimator _.animate(…)_
#### Parameters
`element`, `property`, `[from=null]`, `[to=1]`, `[duration=1]`, `[options]`

argument | data type | description | example
-|-|-|-
element | [_sceneElement_](#sceneelement) or [_paper.Item_](http://paperjs.org/reference/item/) | The SceneElement (or Paper.js item) to be animated | scene.bear
property | _String_| The property to be animated | "opacity"
from | _String_ or _Number_| Start value of the animation. Use null to use the current value | 0.5
to | _String_ or _Number_ | End value of the animation. Numeric Strings yield in relative addition/subtraction (like "+10" will yield the current value + 10) | 1
duration | _Number_ | Duration of the animation in seconds | 1.5
options | _Object_ | [Configure the animation.](#animation-options) | { delay: 1 }

#### Returns
A handler with the following properties:

property | data type | description
-|-|-
then | _Function_ | shortcut for [Danimator.then](#danimator-then)(…)
options | _Object_ | original options passed to [Danimator.animate](#danimator-animate)(…)
stop | _Function_ | used to prevent delayed animation from happening
___

### Danimator _.then(…)_
#### Parameters
`animationMethod`, `[element]`, `[…]`

argument | data type | description | example
-|-|-|-
animationMethod | _String_ or _Function_ | The Danimator method to be used or a callback to be called after the animation has finished | "animate"
[…] | If animationMethod is 'animate', all following parameters correspond to the ones you'd pass to [Danimator.animate](#danimator-animate))

#### Returns
Whatever the according animation method would return – most times a [Danimator handler](#returns) for easier chaining.
