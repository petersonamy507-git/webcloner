AOS.init({})



$('.center-main-slider').owlCarousel({
    dots: false,
    nav: false,
    loop: true,
    autoWidth: false,
    mouseDrag: true,
    autoplay: true,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 1,
        },
        414: {
            items: 1,
        },
        575: {
            items: 2,
        },
        600: {
            items: 2,
        },
        992: {
            items: 4,
        }
    }
});

$('.logo-portfolio-slider').owlCarousel({
    dots: false,
    items: 6,
    nav: false,
    autoWidth: false,
    autoplay: false,
    responsive: {
        0: {
            items: 1,
        },
        414: {
            items: 1,
        },
        600: {
            items: 2,
        },
        992: {
            items: 3,
        },
        1000: {
            items: 4,
        }
    }
})

$('.simple-sol').owlCarousel({
    dots: false,
    items: 3,
    margin: 30,
    nav: true,
    autoplay: false,
    responsive: {
        0: {
            items: 1,
            nav: false,
            dots: true
        },
        414: {
            items: 1,
            nav: false,
            dots: true
        },
        575: {
            items: 1,
            nav: false,
            dots: true
        },
        767: {
            items: 2,
            nav: false,
            dots: true
        },
        992: {
            items: 3,
            nav: false,
            dots: true
        },
        1280: {
            items: 3
        }
    }
});
$(".pack-box .pack-detail ul").slimScroll({
    height: "270px",
    color: "#545454"
});
0 != $(".scroll").length && $(".scroll").slimScroll({
    height: "20px",
    size: "6px",
    color: "#545454",
    alwaysVisible: !0,
    distance: "20px",
    railVisible: !0,
    railColor: " #545454",
    railOpacity: 1,
    railBorderRadius: "0px",
    wheelStep: 10,
    disableFadeOut: !1
});

$('.package-slider').owlCarousel({
    dots: false,
    nav: true,
    margin: 20,
    mouseDrag: true,
    autoplay: true,
    autoplayHoverPause: true,
    loop: true,
    responsive: {
        0: {
            items: 1,
            dots: true,
            nav: false,
        },
        414: {
            items: 1,
            dots: true,
            nav: false,
        },
        575: {
            items: 1,
            dots: true,
            nav: false,
        },
        600: {
            items: 1,
        },
        991: {
            items: 2,
        },
        1000: {
            items: 3,
        }
    }
}).trigger('refresh.owl.carousel');


var currentTab = 0;

function showTab(e) {
    var t = document.getElementsByClassName("tab");
    t[e].style.display = "block", 0 == e ? (document.getElementById("prevBtn").style.display = "none", document.getElementById("signupBtn2").style.display = "none", document.getElementById("nextBtn").style.display = "inline") : document.getElementById("prevBtn").style.display = "inline", e == t.length - 1 ? (document.getElementById("nextBtn").style.display = "none", document.getElementById("signupBtn2").style.display = "inline") : document.getElementById("nextBtn").innerHTML = "Next"
}

function nextPrev(e) {
    var t = document.getElementsByClassName("tab");
    if (1 == e && !validateForm()) return !1;
    t[currentTab].style.display = "none", showTab(currentTab += e)
}

function validateForm() {
    var e, t, s = !0;
    for (e = document.getElementsByClassName("tab")[currentTab].getElementsByTagName("input"), t = 0; t < e.length; t++) "" == e[t].value && (e[t].className += " invalid", s = !1);
    return s
}
var currentTab03 = 0;

function showTabPopupExit(e) {
    var t = document.getElementsByClassName("tab03");
    t[e].style.display = "block", 0 == e ? (document.getElementById("prevBtn03").style.display = "none", document.getElementById("signupBtn03").style.display = "none", document.getElementById("nextBtn03").style.display = "inline") : document.getElementById("prevBtn03").style.display = "inline", e == t.length - 1 ? (document.getElementById("nextBtn03").style.display = "none", document.getElementById("signupBtn03").style.display = "inline") : document.getElementById("nextBtn03").innerHTML = "Next"
}

// single input field form
var currentTab2 = 0;
function showTab2(t) {
    var e = document.getElementsByClassName("tab2");
    (e[t].style.display = "block"),
        0 == t
            ? ((document.getElementById("prevBtn2").style.display = "none"), (document.getElementById("signupBtn3").style.display = "none"), (document.getElementById("nextBtn").style.display = "inline"))
            : (document.getElementById("prevBtn2").style.display = "inline"),
        t == e.length - 1
            ? ((document.getElementById("nextBtn2").style.display = "none"), (document.getElementById("signupBtn3").style.display = "inline"))
            : (document.getElementById("nextBtn2").innerHTML = "Next");
}

function nextPrev2(t) {
    var e = document.getElementsByClassName("tab2");
    if (1 == t && !validateForm2()) return !1;
    (e[currentTab2].style.display = "none"), showTab2((currentTab2 += t));
}

function validateForm2() {
    var t,
        e,
        a = !0;
    for (t = document.getElementsByClassName("tab2")[currentTab2].getElementsByTagName("input"), e = 0; e < t.length; e++) "" == t[e].value && ((t[e].className += " invalid"), (a = !1));
    return a;
}

$(window).width() <= 991 &&
    0 != ".package-carousel".length &&
    ($(".package-carousel").addClass("owl-carousel owl-theme"),
        $(".package-carousel").owlCarousel({
            loop: !1,
            // margin: 0,
            nav: !1,
            dots: !0,
            autoplay: false,
            autoplayTimeout: 4e3,
            autoplayHoverPause: !0,
            mouseDrag: !0,
            items: 4,
            margin: 20,

            responsive: {
                0: {
                    items: 1
                }, 460: {
                    items: 1
                },
                767: {
                    items: 1
                },
                991: {
                    items: 2
                }
            },
        })),

    $('.spot-slider').owlCarousel({
        items: 4,
        loop: true,
        dots: true,
        autoplayHoverPause: true,
        nav: false,
        margin: 70,
        autoHeightClass: 'owl-height',
        autoplay: true,
        autoWidth: false,
        responsive: {
            0: {
                items: 1,
                margin: 5,
            },
            575: {
                items: 2,
                margin: 15,
                dots: true,
            },
            768: {
                items: 2
            },
            1366: {
                items: 4,
            }
        }
    });

$('.logo-ban-slider').slick({
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    fade: true,
    loop: false,
    asNavFor: '.ban-logo-slider-nav'
});
$('.ban-logo-slider-nav').slick({
    slidesToShow: 6,
    slidesToScroll: 1,
    asNavFor: '.logo-ban-slider',
    dots: false,
    centerMode: true,
    focusOnSelect: true,
    loop: false
});


// const lscroll = new LocomotiveScroll({
//     el: document.querySelector('[data-scroll-container]'),
//     smooth: true,
//     inertia: 1,
//     repeat: true,
//     getDirection: true
// });


$('.vertical-tabs li').click(function () {
    // alert('working')
    $('.vertical-tabs li, .vertical-tabs-image li').removeClass('active-tab active-img')
    $(this).addClass('active-tab')
    $(this).parents('.tabs-area').children('.vertical-tabs-image').children('li').addClass('active-img')
});

// lscroll.on("scroll", ScrollTrigger.update);
// ScrollTrigger.scrollerProxy(".scroll-wrapper", {

//     scrollTop(value) {
//         return arguments.length ? lscroll.scrollTo(value, 0, 0) : lscroll.scroll.instance.scroll.y;
//     },
//     getBoundingClientRect() {
//         return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
//     },

//     pinType: document.querySelector('.scroll-wrapper').style.transform ? "transform" : "fixed"

// });

// mega menu for gsap



let megaMenuBtn = document.querySelector(".menu-open");
let megaMenuClose = document.querySelector(".menu-close");

let myBody = document.querySelector("body");

var selectorzIndex = document.querySelector('.main_navigation-overlay');
function ReverseTween() {
    selectorzIndex.style.zIndex = "-4"
}

function StartTween() {
    selectorzIndex.style.zIndex = "4"
}


// time line
let megaMenuTimeline = gsap.timeline({ paused: true });
let megaMenuRightTimeline = gsap.timeline({ paused: true });

megaMenuTimeline.to(".over-animation, .main_navigation-overlay, .mega-nav", {
    // yPercent: -100,
    duration: 3,
    scaleY: 1,
    height: "100%",
    ease: "power4.inOut",
    onReverseComplete: ReverseTween,
    onStart: StartTween
});


megaMenuTimeline.from(".main_nav-list a span, .main_nav-list li strong", {
    y: 100,
    duration: 4,
    ease: "power4.inOut"
}, 0);

megaMenuTimeline.from(".serv-menu-heading", {
    y: 150,
}, 0);

megaMenuTimeline.from(".menu-serv-content", {
    y: 150
}, 0);


megaMenuTimeline.from(".menu-serv-content h6", {
    y: 50
}, 0);

megaMenuTimeline.from(".menu-serv-content p", {
    y: 50
}, 0);


megaMenuRightTimeline.to(".serv-menu-heading", {
    y: 0,
    duration: 2,
    ease: "power4.inOut"
}, 0)

megaMenuRightTimeline.to(".menu-serv-wrapper img", {
    y: 0,
    duration: 2,
    ease: "power4.inOut",
    height: '100%'
}, 0)

megaMenuRightTimeline.to(".menu-serv-content h6", {
    y: 0,
    duration: 2,
    ease: "power4.inOut"
}, 0)

megaMenuRightTimeline.to(".menu-serv-content p", {
    y: 0,
    duration: 2,
    ease: "power4.inOut"
}, 0)

megaMenuTimeline.to(".menu-serv-content", {
    y: 0,
    duration: 4,
    ease: "power4.inOut"
}, "-=.5");

megaMenuRightTimeline.to(".menu-serv-wrapper img", {
    ease: "power1.inOut",
    borderRadius: "20px"
}, "-=.8")

megaMenuRightTimeline.to(".borderLine", {
    duration: 1,
    width: "100%",
    ease: "power4.inOut"
}, "-=.8")



megaMenuTimeline.from(".animateText", {
    opacity: 0,
    display: "none",
    duration: 4,
    ease: "power4.inOut"
}, 0);


megaMenuBtn.addEventListener("click", function () {
    megaMenuTimeline.play();
    megaMenuRightTimeline.play();
    megaMenuTimeline.timeScale(2);
    megaMenuClose.style.display = "block";
    megaMenuBtn.style.display = "none";
    // myBody.style.overflowY = "hidden";
    myBody.classList.add("menuShow")
});

megaMenuClose.addEventListener("click", function () {
    megaMenuTimeline.reverse();
    megaMenuRightTimeline.reverse();
    megaMenuClose.style.display = "none";
    megaMenuBtn.style.display = "block";
    // myBody.style.overflowX = "hidden";
    // myBody.style.overflowY = "scroll";
    myBody.classList.remove("menuShow");
});



gsap.registerPlugin(ScrollTrigger);

var firstElm = document.querySelectorAll(".first-elm");
var secondElm = document.querySelectorAll(".second-elm");
var animationElm = document.querySelectorAll(".div-rotate");

// console.log(firstElm);
// gsap.set(animationElm, { transformOrigin: "center center" });
let master = gsap
    .timeline({
        duration: 1,

    })
    .fromTo(firstElm, { x: "100vw" }, { x: "0" })
    .fromTo(secondElm, { x: "-100vw" }, { x: "0" }, "-=0.5")
    .to(animationElm, { rotationZ: 180 }, "+=0.25")
    .fromTo(firstElm, { x: "0" }, { x: "-100vw" })
    .fromTo(secondElm, { x: "0" }, { x: "100vw" }, "-=0.5");

ScrollTrigger.create({
    trigger: ".animation-elm",
    // scroller: ".scroll-wrapper",
    // toggleActions: "restart none none none",
    scrub: true,
    start: "top 200%",
    end: "bottom center",
    markers: false,
    animation: master,
    onEnter() {
        myBody.classList.add('disable');
    },
    onLeave() {
        myBody.classList.remove('disable');
    },
    onEnterBack() {
        myBody.classList.add('disable');
    },
    onLeaveBack() {
        myBody.classList.remove('disable');
    }
});

$('.simp-box-wrap').mouseover(function () {
    var $secAddClass = $(this).parents('.simpler-sol');
    $secAddClass.addClass('hide-title');
    var $getImage = $(this).data('img');
    var $getVideo = $(this).data('video');
    $secAddClass.find('.simbox-bg').attr('style', 'background-image:url(' + $getImage + ')');
    $secAddClass.find('.simbox-bg video').attr('src', $getVideo);
});

$('.simp-box-wrap').mouseout(function () {
    var $secAddClass = $(this).parents('.simpler-sol');
    var $getVideo = $(this).data('video');
    $secAddClass.removeClass('hide-title');
    $secAddClass.find('.simbox-bg').attr('style', '');
    $secAddClass.find('.simbox-bg video').attr('src', '');
});

function mobileShowImage() {
    $('.simp-box-wrap').mouseover(function () {
        var $secAddClass = $(this).parents('.simpler-sol');
        $secAddClass.addClass('hide-title');
        var $getImage = $(this).data('img-mobile');
        var $getVideo = $(this).data('video-mobile');
        $secAddClass.find('.simbox-bg').attr('style', 'background-image:url(' + $getImage + ')');
        $secAddClass.find('.simbox-bg video').attr('src', $getVideo);
    });

    $('.simp-box-wrap').mouseout(function () {
        var $secAddClass = $(this).parents('.simpler-sol');
        var $getVideo = $(this).data('video-mobile');
        $secAddClass.removeClass('hide-title');
        $secAddClass.find('.simbox-bg').attr('style', '');
        $secAddClass.find('.simbox-bg video').attr('src', '');
    });
}

//  if($(window).width() <= 575) {
//     mobileShowImage();
//     console.log('chal gye')
//  }

if ($(window).width() <= 768) {
    $('.serv-menu-heading').click(function () {
        $('.menu-bg-black').toggleClass('open-services')
    })
}





// ScrollTrigger.addEventListener("refresh", () => lscroll.update());
// ScrollTrigger.refresh();


$('.sponsor-slider-two').owlCarousel({
    loop: true,
    margin: 30,
    responsiveClass: true,
    nav: false,
    dots: false,
    loop: true,
    autoplay: true,
    autoplayTimeout: 2000,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 2,
        },
        480: {
            items: 3,
        },
        768: {
            items: 5,
        },
        992: {
            items: 3,
        },
        1200: {
            items: 4,
        },
    }
});

$('.sponsor-slider-4').owlCarousel({
    loop: true,
    margin: 30,
    responsiveClass: true,
    nav: false,
    dots: false,
    loop: true,
    autoplay: true,
    autoplayTimeout: 2000,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 2,
        },
        480: {
            items: 3,
        },
        768: {
            items: 5,
        },
        992: {
            items: 6,
        },
        1200: {
            items: 7,
        },
    }
});


$(document).scroll(function () {
    "use strict";
    var y = $(this).scrollTop();
    if (y > 200) {
        $('.sticky-container').fadeIn();
    } else {
        $('.sticky-container').fadeOut();
    }

    if (y >= 70) {
        $(".header-main").addClass("stickyyy");
    } else {
        $(".header-main").removeClass("stickyyy");
    }
    if (y > 0) {
        $('.floating_wrap').addClass('visible');
        $('.floatbutton').addClass('visible');


    } else {
        $('.floating_wrap').removeClass('visible');
        $('.floatbutton').removeClass('visible');

    }

});
// sticky social end


$(".clickbutton").click(function () {
    $('.floatingform-sec').toggleClass("show");
    $('.crossplus').toggleClass("rotate");
});


$(".outer-show").click(function () {
    $('body').toggleClass('show');
    $('.floatingform-sec').toggleClass('show');
    $('.overlayfloatingform').toggleClass('show');
});


$(".clickbutton").click(function () {
    $('.overlayfloatingform').removeClass('show');
});


$(document).ready(function () {
    $(".clickbutton").click(function () {
        $('.floatbutton').toggleClass("active");
        $('.crossplus').toggleClass("rotate");
    });

    $(".topformswitch").click(function () {
        $('.topformwrap').toggleClass("active");
    });

});

$('.logo-slider').owlCarousel({
    margin: 30,
    responsiveClass: true,
    nav: false,
    dots: false,
    loop: true,
    autoplay: true,
    autoplayTimeout: 2000,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 2,
        },
        480: {
            items: 3,
        },
        768: {
            items: 4,
        },
        992: {
            items: 5,
        },
        1200: {
            items: 6,
        },
    }
})
$('.web-portfolio-slider').owlCarousel({
    nav: true,
    loop: false,
    dots: false,
    nav: false,
    autoWidth: false,
    loop: true,
    autoplay: true,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 1,
        },
        414: {
            items: 1,
        },
        575: {
            items: 2,
        },
        600: {
            items: 2,
        },
        992: {
            items: 4,
        }
    }
});


$('.dmca-badge').attr('href', 'javascript:;');

// Scratch Code JS

// var offercard = document.querySelector('.offercard');

// $(offercard).hover(function() {
//     $(this).addClass('heading-hide')
// })

// window.onload = function () {

//     for (let index = 0; index < 100; index++) {
//         let box = document.createElement("span");
//         box.className = "scratchArea";
//         offercard.append(box);
//     }

//     var cards = document.querySelectorAll(".scratchArea");
//     cards.forEach((singleCard) => {
//         singleCard.addEventListener('mousemove', function () {
//             this.style.backdropFilter = "blur(0px)";
//             this.style.background = "transparent";
//         })

//     })

// }
