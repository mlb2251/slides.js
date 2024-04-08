"use strict";

const aspect_ratio = 9 / 16
const WIDTH = 1000 // 10.4 inches
const HEIGHT = WIDTH * aspect_ratio

let slide_container = undefined
let active_transitions = 0
let config = {
    running_animation: false,
    tracing_animation: false,
}
let state = {}
const anim_queue = []
// const trace = []
// const frames = []
const slides = []
let slide_idx = 0
let frame_idx = 0
let anim_idx = 0
let anim_interval = undefined
let slide_mode = "view"

function select(path) {
    return slide_container.select(path)
}

function clearSlide() {
    getForeground().selectAll("*").remove()
    getForeground().append("rect")
        .style("fill", "none")
        .style("stroke", "none")
        .attr("width", WIDTH)
        .attr("height", HEIGHT)
}

// for a selection (or transition)
function apply_attrs(selection, attrs) {
    for (const entry of attrs) {
        if (entry[0] == "#") {
            selection.attr("id", entry.slice(1))
        } else if (entry[0] == ".") {
            selection.classed(entry.slice(1), true)
        } else if (entry.includes("=")) {
            const [key, value] = entry.split("=")
            if (key == "duration")
                selection.duration(value)
            else if (key == "delay")
                selection.delay(value)
            else if (key == "wx")
                selection.attr("x", WIDTH * value)
            else if (key == "wy")
                selection.attr("y", HEIGHT * value)
            else 
                selection.attr(key, value)
        } else if (entry.includes(":")) {
            const [key, value] = entry.split(":")
            selection.style(key, value)
        } else if (entry.length == 0) {
            // pass
        } else {
            throw Error("Unknown entry: " + entry)
        }
    }
    return selection
}

function append(type) {
    const attrs = type.split(" ")
    const new_selection = getForeground().append(attrs[0])
    return apply_attrs(new_selection, attrs.slice(1))
}

function insert(type, before) {
    const attrs = type.split(" ")
    const new_selection = getForeground().insert(attrs[0], before)
    return apply_attrs(new_selection, attrs.slice(1))
}

function getSlide() {
    return slide_container
}

const getBackground = () => select("#slide-background")
const getForeground = () => select("#slide-foreground")
const getDefs = () => select("#defs")

function createSlideLayout() {
    const columns = document.createElement("div");
    columns.setAttribute("id", "columns");
    document.body.appendChild(columns);

    const thumbnails = document.createElement("div");
    thumbnails.setAttribute("id", "thumbnails");
    columns.appendChild(thumbnails);

    const slides_with_notes = document.createElement("div");
    slides_with_notes.setAttribute("id", "slides-with-notes");
    columns.appendChild(slides_with_notes);

    const div_slide_container = document.createElement("div");
    div_slide_container.setAttribute("id", "slide-container");
    slides_with_notes.appendChild(div_slide_container);

    const svg = d3.select(div_slide_container).append("svg")
        .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)

    svg.append("defs").attr("id", "defs")

    const active_slide = svg.append("g")
        .attr("id", "active-slide")

    active_slide.append("rect")
        .attr("id", "slide-background")
        .attr("width", WIDTH)
        .attr("height", HEIGHT)
    const fg = active_slide.append("g")
        .attr("id", "slide-foreground")

    d3.select(div_slide_container).on("click", function (e) {
        const [x, y] = d3.pointer(e, getForeground().node())
        // getForeground().append(`circle cx=${x} cy=${y} r=10 fill=red`)
        const wx = (x / WIDTH).toFixed(2)
        const wy = (y / HEIGHT).toFixed(2)
        navigator.clipboard.writeText(`c.wx(${wx}).wy(${wy})`);
    })

    // d3.select("defs").append("marker")

    const notes = document.createElement("div");
    notes.setAttribute("id", "notes");
    slides_with_notes.appendChild(notes);

    // const textarea = document.createElement("textarea");
    // textarea.setAttribute("id", "notes-textarea");
    // notes.appendChild(textarea);

    const save_as_pdf = document.createElement("button");
    save_as_pdf.setAttribute("id", "save-as-pdf");
    save_as_pdf.textContent = "Save as PDF"
    save_as_pdf.onclick = () => {
        const doc = new jspdf.jsPDF();

        for (const slide of slides) {
            for (const frame of slide.frames) {
                doc.addSvgAsImage(frame.slide, 0, 0, WIDTH, HEIGHT);
                // doc.addImage(frame.slide, 'PNG', 15, 40, 180, 160);
            }
        }

        doc.text("Hello world!", 10, 10);
        doc.save("a4.pdf");
    }
    slides_with_notes.appendChild(save_as_pdf);

    slide_container = d3.select(div_slide_container)
    override_selections()
    override_transitions()

}


function override_selections() {

    d3.select().__proto__.x = function () {
        return this.bbox().x
    }
    d3.select().__proto__.y = function () {
        return this.bbox().y
    }
    d3.select().__proto__.width = function () {
        return this.bbox().width
    }
    d3.select().__proto__.height = function () {
        return this.bbox().height
    }
    d3.select().__proto__.bottom = function () {
        return this.bbox().bottom
    }
    d3.select().__proto__.right = function () {
        return this.bbox().right
    }
    d3.select().__proto__.midx = function () {
        return this.bbox().midx
    }
    d3.select().__proto__.midy = function () {
        return this.bbox().midy
    }

    const append_old = d3.select().__proto__.append
    d3.select().__proto__.append = function (path) {
        const attrs = path.split(" ")
        const new_selection = append_old.bind(this)(attrs[0])
        return apply_attrs(new_selection, attrs.slice(1))
    }

    const insert_old = d3.select().__proto__.insert
    d3.select().__proto__.insert = function (path, before) {
        const attrs = path.split(" ")
        const new_selection = insert_old.bind(this)(attrs[0], before)
        return apply_attrs(new_selection, attrs.slice(1))
    }

    const text_old = d3.select().__proto__.text
    d3.select().__proto__.text = function (str, spacing = 1.5) {
        // behavior on tspans
        if (this.node().nodeName == "tspan")
            return text_old.bind(this)(str)
        
        // behavior on text elems
        this.selectAll("tspan").remove()
        this.append_text(str, spacing)
        return this
    }

    d3.select().__proto__.append_text = function (str, spacing = 1.5) {
        str = str.replace(/ /g, "\u00A0")
        str = str.replace(/\t/g, "\u00A0\u00A0\u00A0\u00A0")
        let sel = d3.select()
        const fontsize = this.attr("font-size") // || this.style("font-size")
        for (const line of str.split("\n")) {
            const tspan = this.append("tspan").text(line)
                .attr("x", this.attr("x"))
                .attr("dy", spacing * fontsize)
            sel = sel.merge(tspan)
        }
        return sel
    }
    // d3.select().__proto__.tspans = function () {
    //     return this.selectAll("tspan")
    // }
    // d3.select().__proto__.get = function (idx) {
    //     return d3.select(this.nodes()[idx])
    // }
    // d3.select().__proto__.slice = function (...args) {
    //     return d3.select(this.nodes.slice(...args))
    // }
    // d3.select().__proto__.last = function (...args) {
    //     return d3.select(this.nodes()[this.nodes().length - 1])
    // }


    d3.select().__proto__.bbox = function (callback, margin = 0) {
        const bbox = this.node().getBBox()
        // check if margin is a number

        bbox.bottom = bbox.y + bbox.height
        bbox.right = bbox.x + bbox.width
        bbox.midx = bbox.x + bbox.width / 2
        bbox.midy = bbox.y + bbox.height / 2

        if (typeof margin === 'number' && margin != 0) {
            bbox.x -= margin
            bbox.y -= margin
            bbox.width += 2 * margin
            bbox.height += 2 * margin
        } else {
            bbox.x -= margin.left || 0
            bbox.y -= margin.top || 0
            bbox.width += (margin.left || 0) + (margin.right || 0)
            bbox.height += (margin.top || 0) + (margin.bottom || 0)
        }
        if (!callback)
            return bbox
        return callback(bbox)
    }
}
function bbox_xy(bbox) {
    return `x=${bbox.x} y=${bbox.y}`
}
function bbox_wh(bbox) {
    return `width=${bbox.width} height=${bbox.height}`
}
function bbox_xywh(bbox) {
    return `x=${bbox.x} y=${bbox.y} width=${bbox.width} height=${bbox.height}`
}


// override how transitions work
function override_transitions() {
    const transition_old = d3.select().__proto__.transition
    d3.select().__proto__.transition = function (name, attrs="") {
        attrs = attrs.split(" ")
        const t = transition_old.bind(this)(name)
        t.attr_targets = {}
        t.style_targets = {}

        apply_attrs(t, attrs)

        t.on("start", function (d, i, nodes) {
            active_transitions += 1
            // console.log("active transitions: ", active_transitions)
        })
        t.on("end", function (d, i, nodes) {
            active_transitions -= 1
            // console.log("active transitions: ", active_transitions)
        })
        t.on("cancel", function () {
            // console.log("active transitions: ", active_transitions)
            for (const [name, val] of Object.entries(t.attr_targets)) {
                d3.select(this).attr(name, val) // technically if `val` is a fn i think it should have been executed before already
            }
            for (const [name, val] of Object.entries(t.style_targets)) {
                d3.select(this).style(name, val)
            }
        })
        t.on("interrupt", function () {
            active_transitions -= 1
            for (const [name, val] of Object.entries(t.attr_targets)) {
                d3.select(this).attr(name, val) // technically if `val` is a fn i think it should have been executed before already
            }
            for (const [name, val] of Object.entries(t.style_targets)) {
                d3.select(this).style(name, val)
            }
        })
        return t
    }

    const attr_old = d3.transition().__proto__.attr
    d3.transition().__proto__.attr = function (name, val) {
        if (config.tracing_animation) {
            // just set the attribute immediately
            this.nodes().forEach(n => n.setAttribute(name, val))
            return this
        }

        this.attr_targets[name] = val
        return attr_old.bind(this)(name, val)
    }

    const style_old = d3.transition().__proto__.style
    d3.transition().__proto__.style = function (name, val) {
        if (config.tracing_animation) {
            // just set the attribute immediately
            this.nodes().forEach(n => n.setAttribute(name, val))
            return this
        }
        this.style_targets[name] = val
        return style_old.bind(this)(name, val)
    }

    const duration_old = d3.transition().__proto__.duration
    d3.transition().__proto__.duration = function (time) {
        if (config.tracing_animation)
            return this
        return duration_old.bind(this)(time)
    }

    const delay_old = d3.transition().__proto__.delay
    d3.transition().__proto__.delay = function (time) {
        if (config.tracing)
            return this
        return delay_old.bind(this)(time)
    }
}

function slidenum() {
    select("#slidenum").remove()
    select("svg").append("text")
        .attr("id", "slidenum")
        .text(`Slide ${slide_idx} / Frame ${frame_idx} / Anim ${anim_idx}`)
        .attr("x", WIDTH - 20)
        .attr("y", 35)
        .attr("text-anchor", "end")
        .attr("font-size", 24)
}


function load(slide, frame = 0, no_anim = false) {
    clearInterval(anim_interval)
    slide_idx = slide
    frame_idx = frame
    // console.log(`load slide ${slide_idx}, frame ${frame_idx}`)
    const f = slides[slide_idx].frames[frame_idx]
    anim_idx = 0

    if (no_anim && f.anims.length != 0) {
        // show the very last frame
        anim_idx = f.anims.length - 1
        restore_slide(f.anims[anim_idx].slide_end)
    } else {
        // show the first frame, and launch the anims
        restore_slide(f.slide)
        if (f.anims.length != 0) {
            anim_interval = setInterval(run_anim_if_ready, 50)
            run_anim_if_ready()
        }
    }
    slidenum()
}

function restore_slide(svg_string) {
    select("svg").remove()
    let new_active_slide = new DOMParser().parseFromString(svg_string, "image/svg+xml").documentElement;
    getSlide().node().appendChild(new_active_slide)
    save_to_url()
    d3.selectAll(".thumbnail").classed("selected-thumbnail", false)
    d3.select(d3.selectAll(".thumbnail").nodes()[slide_idx]).classed("selected-thumbnail", true)
    // curr_slide = entry.slide.clone(true).style("display", null).attr("id", "active-slide") // make it visible again
}
function save_slide() {
    return new XMLSerializer().serializeToString(select("svg").node());
    // return d3.select("#active-slide").clone(true).style("display", "none").attr("id", null)
}

function save_state() {
    return structuredClone(state)
}
function restore_state(s) {
    state = structuredClone(s)
}

function save_to_url() {
    window.history.replaceState({}, '', `${window.location.pathname}?mode=${slide_mode}&slide=${slide_idx}&frame=${frame_idx}&anim=${anim_idx}`);
}
function load_from_url() {
    const urlParams = new URLSearchParams(window.location.search);
    const slide = urlParams.get('slide') || 0;
    const frame = urlParams.get('frame') || 0;
    const anim = urlParams.get('anim') || 0;
    slide_mode = urlParams.get('mode') || "view";
    load(Number(slide), Number(frame), Number(anim))
}

function next_slide() {
    if (slide_idx < slides.length - 1)
        return load(slide_idx + 1, 0) // load next slide
}
function prev_slide() {
    if (slide_idx > 0)
        return load(slide_idx - 1, slides[slide_idx - 1].frames.length - 1, true) // load previous slide
}

function next_frame() {
    if (frame_idx < slides[slide_idx].frames.length - 1)
        return load(slide_idx, frame_idx + 1) // load next frame
    next_slide()
}
function prev_frame() {
    if (frame_idx > 0)
        return load(slide_idx, frame_idx - 1, true) // load previous frame
    prev_slide()
}

function run_anim_if_ready() {
    const f = slides[slide_idx].frames[frame_idx]
    if (anim_idx >= f.anims.length) {
        // no more anims to run
        clearInterval(anim_interval)
        return
    }

    const next_anim = f.anims[anim_idx]

    if (next_anim.block && active_transitions != 0)
        return // wait for all transitions to finish

    // we're good to go
    anim_idx += 1
    slidenum()
    state = restore_state(next_anim.state)
    config.running_animation = true
    next_anim.anim()
    config.running_animation = false
}

d3.select("body").on("keydown", function (e) {
    if (e.key === "ArrowRight") {
        next_frame()
    }
    if (e.key === "ArrowLeft") {
        prev_frame()
    }
    if (e.key === "ArrowDown") {
        next_slide()
    }
    if (e.key === "ArrowUp") {
        prev_slide()
    }
})

function make_thumbnail_svg(svg_string) {
    const this_slide_idx = slides.length - 1

    const svg = new DOMParser().parseFromString(svg_string, "image/svg+xml").documentElement;
    d3.select(svg)
        .classed("thumbnail", true)
        .on("click", function () {
            load(this_slide_idx)
        })

    document.getElementById("thumbnails").appendChild(svg)
    return svg
}

function startSlides() {
    createSlideLayout()
    startSlide()
}

function finishSlides() {
    finishSlide()
    load_from_url()
}

function startSlide() {
    slides.push({
        frames: [],
        finished: false
    })
}

function finishSlide() {
    if (slides.length == 0)
        return
    if (slides[slides.length - 1].finished)
        return
    frame() // add the last frame to the slide
    make_thumbnail_svg(save_slide())
    slides[slides.length - 1].finished = true
}

function newSlide() {
    finishSlide()
    clearSlide()
    startSlide()
}

function sameSlide() {
    finishSlide()
    startSlide()
}

function frame() {
    const slide = slides[slides.length - 1]
    // console.log(`making slide ${slides.length-1} frame ${slide.frames.length}`)
    slide.frames.push({
        slide: save_slide(),
        anims: []
    })
}

function withPrevious(animation) {
    return animate(animation, false)
}
function afterPrevious(animation) {
    return animate(animation, true)
}
function onClick(animation) {
    frame()
    frame()
    return animate(animation, true)
}

function animate(animation, block = true) {
    const slide = slides[slides.length - 1]
    const f = slide.frames[slide.frames.length - 1]
    f.anims.push({
        type: "animate",
        slide: save_slide(),
        slide_end: undefined,
        state: save_state(),
        block: block,
        anim: animation
    })
    if (config.tracing_animation)
        throw Error("ERROR: animate() called inside of animate()")
    config.tracing_animation = true
    animation()
    config.tracing_animation = false
    f.anims[f.anims.length - 1].slide_end = save_slide()
}

class Cursor {
    constructor() {
        this._x = 0
        this._y = 0
        this.group = getForeground()
        this.elem = this.group
        this.history = []
        this.presets = {}
        this.keypoints = []
    }
    copy() {
        const c = new Cursor()
        c._x = this._x
        c._y = this._y
        c.group = this.group
        c.elem = this.elem
        c.history = this.history.slice()
        // c.begun = this.begun.map(x => x.slice())
        c.presets = {...this.presets}
        c.keypoints = this.keypoints.map(p => p.slice())
        return c
    }
    bbox() {
        return bbox_abs(this.elem)
    }
    gbbox() {
        return bbox_abs(this.group)
    }
    wx(x) {
        this._x = WIDTH * x
        return this
    }
    wy(y) {
        this._y = HEIGHT * y
        return this
    }
    x(frac) {
        if (typeof frac == "object") {
            this._x = frac._x
            return this
        }
        const bbox = bbox_abs(this.elem)
        this._x = bbox.x + frac * bbox.width
        return this
    }
    y(frac) {
        if (typeof frac == "object") {
            this._y = frac._y
            return this
        }
        const bbox = bbox_abs(this.elem)
        this._y = bbox.y + frac * bbox.height
        return this
    }
    dx(val) {
        this._x += val
        return this
    }
    dy(val) {
        this._y += val
        return this
    }
    gx(frac) {
        // this._x = this.gbbox.x + frac * this.gbbox.width
        const bbox = bbox_abs(this.group)
        this._x = bbox.x + frac * bbox.width
        return this
    }
    gy(frac) {
        // this._y = this.gbbox.y + frac * this.gbbox.height
        const bbox = bbox_abs(this.group)
        this._y = bbox.y + frac * bbox.height
        return this
    }
    ax(x) {
        this._x = x
        return this
    }
    ay(y) {
        this._y = y
        return this
    }
    // select(str) {
    //     const selection = this.group.select(str)
    //     this.groups.push(selection)
    //     this.elem = selection
    // }
    append(str) {
        // this.frame()
        const tokens = str.split(" ")
        const typename = tokens[0]
        const presets = (this.presets[typename] || "").split(" ")
        const attrs = presets.concat(tokens.slice(1))
        // if (this.group.node().getCTM().e != 0 || this.group.node().getCTM().f != 0)
            // console.log("WARNING: group has non-zero translation when placing ", str, this.group.node().getCTM().f, this.group.node().getCTM().e)
        let gctm = this.group.node().getCTM() // this is generally all 0s
        this.elem = this.group.append(typename)
        this.elem.attr("transform", `translate(${this._x-gctm.e},${this._y-gctm.f})`)
        // this.elem.attr("x", this._x-gctm.e)
        // this.elem.attr("y",this._y-gctm.f)
        // this.elem.attr("x", this._x)
        // this.elem.attr("y", this._y)
        apply_attrs(this.elem, attrs)
        return this
    }
    // set_elem_pos() {
    //     const tag = this.elem.node().tagName.toLowerCase()
    // }
    text(str) {
        this.append("text")
        this.elem.text(str)
        return this.x(1)
    }
    textln(str) {
        return this.text(str).x(0).y(2)
    }
    rect(bbox) {
        this._x = bbox.x
        this._y = bbox.y
        this.append(`rect ${bbox.wh()}`)
        return this
    }
    keypoint() {
        this.keypoints.push([this._x, this._y])
        return this
    }
    arrow() {
        const [x2, y2] = this.keypoints.pop()
        const [x1, y1] = this.keypoints.pop()
        this.ax(x1).ay(y1)
        this.append("path")
        this.elem.attr("d", `M 0 0 L ${x2-x1} ${y2-y1}`)
        this.set("stroke=black stroke-width=2 marker-end=url(#arrowhead)")
        return this
    }
    set(str) {
        apply_attrs(this.elem, str.split(" "))
        return this
    }
    preset(type, str) {
        this.presets[type] = (this.presets[type] || "") + " " + str
        return this
    }
    unset(type) {
        this.presets[type] = ""
    }
    call(fn, ...args) {
        fn(this, ...args)
        return this
    }
    right() {
        return this.x(1)
    }
    left() {
        return this.x(0)
    }
    top() {
        return this.y(0)
    }
    bottom() {
        return this.y(1)
    }
    middle() {
        return this.x(.5).y(.5)
    }
    push() {
        this.history.push([this._x, this._y, this.group])
        // const gctm = this.group.node().getCTM()
        this.group = this.group.append("g")
        // this.group.attr("transform", `translate(${this._x-gctm.e},${this._y-gctm.f})`)
        this.elem = this.group
        return this
    }
    pop() {
        this.elem = this.group
        const prev = this.history.pop()
        this._x = prev[0]
        this._y = prev[1]
        this.group = prev[2]
        return this
    }
    frame() {
        const gbbox = bbox_abs(this.group)
        const g_rect = getForeground().append("rect")
            .attr("x", gbbox.x).attr("y", gbbox.y)
            .attr("width", gbbox.width).attr("height", gbbox.height)
            .attr("stroke", "blue").style("opacity", 0.5)
            .attr("stroke-width", 4)
            .attr("fill", "none")
        
        const bbox = bbox_abs(this.elem)
        const elem_rect = getForeground().append("rect")
            .attr("x", bbox.x).attr("y", bbox.y)
            .attr("width", bbox.width).attr("height", bbox.height)
            .style("opacity", 0.2)
            .attr("fill", "orange")

        const circle = getForeground().append("circle").attr("cx", this._x).attr("cy", this._y).attr("r", 5).attr("fill", "red")
        frame()
        circle.remove()
        elem_rect.remove()
        g_rect.remove()
    }
}
const C = () => new Cursor()


/// bbox relative to svg element
function bbox_abs(sel) {
    const svg_client = select("svg").node().getBoundingClientRect()
    const sel_client = sel.node().getBoundingClientRect()
    const scaling = WIDTH / svg_client.width
    return new BBox(
        (sel_client.x - svg_client.x) * scaling,
        (sel_client.y - svg_client.y) * scaling,
        (sel_client.right - sel_client.x) * scaling,
        (sel_client.bottom - sel_client.y) * scaling
    )
}

class BBox {
    constructor(x, y, width, height) {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
        this.bottom = y + height
        this.right = x + width
    }
    margin(margin) {
        // is margin an object?
        if (typeof margin === 'object') {
            return new BBox(
                this.x - (margin.left || 0),
                this.y - (margin.top || 0),
                this.width + (margin.left || 0) + (margin.right || 0),
                this.height + (margin.top || 0) + (margin.bottom || 0)
            )
        }
        return new BBox(
            this.x - margin,
            this.y - margin,
            this.width + 2 * margin,
            this.height + 2 * margin
        )
    }
    xy() {
        return `x=${this.x} y=${this.y}`
    }
    wh() {
        return `width=${this.width} height=${this.height}`
    }
    xywh() {
        return `x=${this.x} y=${this.y} width=${this.width} height=${this.height}`
    }

}

