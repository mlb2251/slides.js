"use strict";

const aspect_ratio = 9 / 16
const WIDTH = 1000
const HEIGHT = WIDTH * aspect_ratio
const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * aspect_ratio

let slide = undefined
let active_transitions = 0
let config = {
    tracing_animation: false,
}
let state = {}
const anim_queue = []
const trace = []
const trace_idx_of_slide_idx = []
let slide_idx = 0
let trace_idx = 0
let anim_interval = undefined

function select(path) {
    return slide.select(path)
}

function append(path) {
    return getForeground().append(path)
}

function getSlide() {
    return slide
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

    const slide_container = document.createElement("div");
    slide_container.setAttribute("id", "slide-container");
    slides_with_notes.appendChild(slide_container);

    const svg = d3.select(slide_container).append("svg")
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


    slide = d3.select(slide_container)
    override_transitions()

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
        .text(`Slide ${slide_idx} / Trace ${trace_idx}`)
        .attr("x", WIDTH - 20)
        .attr("y", 35)
        .attr("text-anchor", "end")
        .attr("font-size", 24)
}

function load(i) {
    if (i >= trace_idx_of_slide_idx.length)
        return
    slide_idx = i
    trace_idx = trace_idx_of_slide_idx[i]

    // note than an interrupt() before remove() won't actually do anything because it won't have a chance to run the
    // interrupt handler before the element is removed... sortof i think.
    // active_transitions = 0
    load_slide(trace[trace_idx])
    slidenum()
    anim_interval = setInterval(run_anim_if_ready, 50)
}

function load_slide(entry) {
    select("svg").remove()
    let new_active_slide = new DOMParser().parseFromString(entry.slide, "image/svg+xml");
    getSlide().node().appendChild(new_active_slide.documentElement)
    // curr_slide = entry.slide.clone(true).style("display", null).attr("id", "active-slide") // make it visible again
}
function save_slide() {
    return new XMLSerializer().serializeToString(select("svg").node());
    // return d3.select("#active-slide").clone(true).style("display", "none").attr("id", null)
}

function save_state() {
    return structuredClone(state)
}
function load_state(s) {
    state = structuredClone(s)
}

function next() {
    if (slide_idx < trace_idx_of_slide_idx.length - 1)
        load(slide_idx + 1)
}
function prev() {
    if (slide_idx > 0)
        load(slide_idx - 1)
}

function run_anim_if_ready() {
    if (active_transitions != 0)
        return // wait for all transitions to finish
    if (trace_idx + 1 > trace.length - 1 || trace[trace_idx + 1].type != "animate") {
        // no anim next - we're safe to disable the check until next load()
        clearInterval(anim_interval)
        return
    }

    trace_idx += 1
    slidenum()
    state = load_state(trace[trace_idx].state)
    trace[trace_idx].anim()
}

d3.select("body").on("keydown", function (e) {
    if (e.key === "ArrowRight") {
        next()
    }
    if (e.key === "ArrowLeft") {
        prev()
    }
})

function make_thumbnail_canvas(svg_string) {
    const this_slide_idx = trace_idx_of_slide_idx.length
    const canvas = d3.select("#thumbnails").append("canvas")
        .classed("thumbnail", true)
        .attr("width", THUMBNAIL_WIDTH)
        .attr("height", THUMBNAIL_HEIGHT)
        .attr("style", "margin: 1px")
        .on("click", function () {
            load(this_slide_idx)
        })
    
    const ctx = canvas.node().getContext("2d")
    const DOMURL = self.URL || self.webkitURL || self;
    const svg = new Blob([svg_string], { type: "image/svg+xml;charset=utf-8" });
    const url = DOMURL.createObjectURL(svg)
    const img = new Image();
    img.onload = function () {
        ctx.drawImage(img, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
        DOMURL.revokeObjectURL(url);
    };
    img.src = url;
    return canvas
}

function make_thumbnail_svg(svg_string) {
    const this_slide_idx = trace_idx_of_slide_idx.length

    const svg = new DOMParser().parseFromString(svg_string, "image/svg+xml").documentElement;
    d3.select(svg)
        .classed("thumbnail", true)
        .on("click", function () {
            load(this_slide_idx)
        })

    document.getElementById("thumbnails").appendChild(svg)
    return svg
}


function frame() {
    const svg_string = save_slide()
    const thumbnail = make_thumbnail_svg(svg_string)

    trace.push({
        type: "frame",
        slide: svg_string
    })
    trace_idx_of_slide_idx.push(trace.length - 1)
}

function afterPrevious(animation) {
    return animate(animation, false)
}
function onClick(animation) {
    return animate(animation, true)
}

function animate(animation, clickToStart = false) {
    if (clickToStart) {
        frame()
        // frame()
    }
    // deepcopy state
    const state_copy = save_state()
    const slide_copy = save_slide()
    trace.push({
        type: "animate",
        slide: slide_copy,
        state: state_copy,
        anim: animation
    })
    if (config.tracing_animation)
        throw Error("ERROR: animate() called inside of animate()")
    config.tracing_animation = true
    animation()
    config.tracing_animation = false
}


// function img_to_data_url(img_src, callback) {
//     const canvas = document.createElement("canvas");
//     const ctx = canvas.getContext('2d');
//     const base_image = new Image();
//     base_image.src = img_src;
//     base_image.onload = function () {
//         canvas.width = base_image.width;
//         canvas.height = base_image.height;
//         ctx.drawImage(base_image, 0, 0);
//         const url = canvas.toDataURL(); // makes a png data url
//         callback(url);
//         canvas.remove();
//     }
// }

