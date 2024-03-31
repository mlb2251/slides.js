"use strict";

const aspect_ratio = 9 / 16
const WIDTH = 1000 // 10.4 inches
const HEIGHT = WIDTH * aspect_ratio
const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * aspect_ratio

let slide_container = undefined
let active_transitions = 0
let config = {
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

function select(path) {
    return slide_container.select(path)
}

function append(type) {
    // parse up to first space (or end of string)
    const entries = type.split(" ")
    const name = entries[0]
    const new_selection = getForeground().append(name)
    entries.slice(1).forEach(entry => {
        if (entry[0] == "#") {
            new_selection.attr("id", entry.slice(1))
        } else {
            const [key, value] = entry.split("=")
            new_selection.attr(key, value)    
        }
    })

    return new_selection
}

function getSlide() {
    return slide_container
}

const getBackground = () => select("#slide-background")
const getForeground = () => select("#slide-foreground")

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

    const active_slide = svg.append("g")
        .attr("id", "active-slide")
    active_slide.append("rect")
        .attr("id", "slide-background")
        .attr("width", WIDTH)
        .attr("height", HEIGHT)
    active_slide.append("g")
        .attr("id", "slide-foreground")

    const notes = document.createElement("div");
    notes.setAttribute("id", "notes");
    slides_with_notes.appendChild(notes);

    const textarea = document.createElement("textarea");
    textarea.setAttribute("id", "notes-textarea");
    notes.appendChild(textarea);


    slide_container = d3.select(div_slide_container)
    override_selections()
    override_transitions()

}


function override_selections() {
    d3.select().__proto__.bbox = function (callback) {
        if (!callback)
            return this.node().getBBox()
        callback(this.node().getBBox())
    }
}

// override how transitions work
function override_transitions() {
    const transition_old = d3.select().__proto__.transition
    d3.select().__proto__.transition = function (name) {
        const t = transition_old.bind(this)(name)
        t.attr_targets = {}
        t.style_targets = {}
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
    const f = slides[slide_idx].frames[frame_idx]
    anim_idx = 0

    if (no_anim && f.anims.length != 0) {
        // show the very last frame
        anim_idx = f.anims.length-1
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

function next_frame() {
    if (frame_idx < slides[slide_idx].frames.length - 1)
        return load(slide_idx, frame_idx + 1) // load next frame
    if (slide_idx < slides.length - 1)
        return load(slide_idx + 1, 0) // load next slide
}
function prev_frame() {
    if (frame_idx > 0)
        return load(slide_idx, frame_idx - 1, true) // load previous frame
    if (slide_idx > 0)
        return load(slide_idx - 1, slides[slide_idx - 1].frames.length - 1, true) // load previous slide
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
    next_anim.anim()
}

d3.select("body").on("keydown", function (e) {
    if (e.key === "ArrowRight") {
        next_frame()
    }
    if (e.key === "ArrowLeft") {
        prev_frame()
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
    load(0)
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

function slide() {
    finishSlide()
    startSlide()
}

function frame() {
    const slide = slides[slides.length - 1]
    console.log(`slide ${slides.length - 1} frame ${slide.frames.length}`)
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
    return animate(animation, true)
}

function animate(animation, block = true) {
    const slide = slides[slides.length - 1]
    const f = slide.frames[slide.frames.length - 1]
    f.anims.push({
        type: "animate",
        slide: save_slide(),
        slide_end: undefined,
        state:  save_state(),
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
