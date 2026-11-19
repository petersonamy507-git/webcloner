$(document).ready((function () {


    // Wow Animation Script
    new WOW().init();

    // Counter Script
    var b = 0;
    $(window).scroll(function () {
        var oTop = $('#counter').offset().top - window.innerHeight;
        if (b == 0 && $(window).scrollTop() > oTop) {
            $('.count').each(function () {
                var $this = $(this),
                    countTo = $this.attr('data-count');
                $({
                    countNum: $this.text()
                }).animate({
                    countNum: countTo
                }, {
                    duration: 7000,
                    easing: 'swing',
                    step: function () {
                        $this.text(Math.floor(this.countNum));
                    },
                    complete: function () {
                        $this.text(this.countNum);
                        //alert('finished');
                    }
                });
            });
            b = 1;
        }
    });

    // Tabs Script
    $('[data-targetit]').on('click', function () {
        $(this).siblings().removeClass('current');
        $(this).addClass('current');
        var target = $(this).data('targetit');
        $('.' + target).siblings('[class*="my-tabs"]').removeClass('current');
        $('.' + target).addClass('current');
        $('.slick-slider').slick('setPosition', 0);
    });

    // Tilt Script
    const tilt = document.querySelectorAll(".tilt");
    VanillaTilt.init(tilt, {
            reverse: !0,
            max: 2,
            speed: 200,
            scale: 1,
            glare: 2,
            reset: !0,
            perspective: 100,
            transition: !0,
            "max-glare": 1,
            "glare-prerender": 1,
            gyroscope: !0,
            gyroscopeMinAngleX: -45,
            gyroscopeMaxAngleX: 45,
            gyroscopeMinAngleY: -45,
            gyroscopeMaxAngleY: 45
        }),

        // Portfolio Flip Script
        $('.hover').hover(function () {
            $(this).addClass('flip');
        }, function () {
            $(this).removeClass('flip');
        });

    // Cta Script
    $('.cta_slider').slick({
        autoplay: true,
        autoplaySpeed: 0,
        speed: 5000,
        arrows: false,
        swipe: false,
        slidesToShow: 2,
        cssEase: 'linear',
        pauseOnFocus: true,
        pauseOnHover: true,
        responsive: [{
                breakpoint: 1399,
                settings: {
                    slidesToShow: 1,
                    slidesToScroll: 1,
                },
            },
            {
                breakpoint: 600,
                settings: {
                    slidesToShow: 1,
                },
            },
            {
                breakpoint: 480,
                settings: {
                    slidesToShow: 1,
                },
            },
        ],
    });
   
    // Services Script
    $('.services_slider').slick({
        autoplay: true,
        autoplaySpeed: 1000,
        speed: 5000,
        dots: true,
        arrows: false,
        swipe: true,
        vertical: true,
        verticalSwiping: true,
        slidesToShow: 1,
        slidesToScroll: 1,
        pauseOnFocus: true,
        pauseOnHover: true,
        responsive: [{
            breakpoint: 768,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1,
                vertical: false,
            },
        }],
    });

// Portfolio Script - Marquee Style
$(".port_slider").slick({
    dots: false,
    infinite: true,
    speed: 4000,           // Slower speed for a smooth marquee effect
    autoplaySpeed: 0,      // No delay between slides
    pauseOnHover: false,   // Keeps moving even on hover
    cssEase: "linear",     // Linear easing for a continuous flow
    autoplay: true,        // Autoplay enabled
    slidesToShow: 2,       // Number of slides visible
    slidesToScroll: 1,     // Scroll one slide at a time for continuity
    arrows: false,         // Hide navigation arrows
    vertical: true,        // Vertical scrolling
    verticalSwiping: false, // Disable vertical swiping for continuous movement
    centerMode: true,      // Center the active slide
    centerPadding: "0px",  // No padding for a smooth transition
    responsive: [{
        breakpoint: 1099,
        settings: {
            slidesToShow: 1,
            slidesToScroll: 1,
        },
    }],
});


    // Awards Winning Script
    $(".awards_slider").slick({
        dots: false,
        autoplay: false,
        slidesToShow: 4,
        slidesToScroll: 4,
        arrows: false,
        responsive: [{
                breakpoint: 600,
                settings: {
                    slidesToShow: 4,
                    slidesToScroll: 4,
                },
            },
            {
                breakpoint: 480,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 2,
                },
            },
        ],
    });

    // testimonials_slider Script
    $(".testimonials_slider").slick({
        dots: true,
        autoplay: false,
        slidesToShow: 1,
        slidesToScroll: 1,
        arrows: false,
    });

    // testimonials_slider Script
    $(".services_sec3_slider").slick({
        dots: false,
        autoplay: false,
        slidesToShow: 3,
        slidesToScroll: 3,
        arrows: false,
        responsive: [{
                breakpoint: 1600,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 2,
                },
            },
            {
                breakpoint: 992,
                settings: {
                    slidesToShow: 1,
                    slidesToScroll: 1,
                },
            },
            {
                breakpoint: 768,
                settings: {
                    slidesToShow: 2,
                    slidesToScroll: 2,
                },
            },
            {
                breakpoint: 575,
                settings: {
                    slidesToShow: 1,
                    slidesToScroll: 1,
                },
            },
        ],
    });

    // Services Section Script
    gsap.registerPlugin(ScrollTrigger);
    let allowScroll =
        true;
    let scrollTimeout = gsap.delayedCall(1, () => allowScroll = true)
        .pause();
    let currentIndex = 0;
    let swipePanels = gsap.utils.toArray(".swipe-section .panel");

    gsap.set(swipePanels, {
        zIndex: i => swipePanels.length - i
    })
    let intentObserver = ScrollTrigger.observe({
        type: "wheel,touch",
        onUp: () => allowScroll && gotoPanel(currentIndex - 1, false),
        onDown: () => allowScroll && gotoPanel(currentIndex + 1, true),
        tolerance: 10,
        preventDefault: true,
        onEnable(self) {
            allowScroll = false;
            scrollTimeout.restart(true);
            let savedScroll = self.scrollY();
            self._restoreScroll = () => self.scrollY(
                savedScroll);
            document.addEventListener("scroll", self._restoreScroll, {
                passive: false
            });
        },
        onDisable: self => document.removeEventListener("scroll", self._restoreScroll)
    });
    intentObserver.disable();

    function gotoPanel(index, isScrollingDown) {
        if ((index === swipePanels.length && isScrollingDown) || (index === -1 && !isScrollingDown)) {
            intentObserver.disable();
            return;
        }
        allowScroll = false;
        scrollTimeout.restart(true);

        let target = isScrollingDown ? swipePanels[currentIndex] : swipePanels[index];
        gsap.to(target, {
            yPercent: isScrollingDown ? -100 : 0,
            duration: 0.75
        });

        currentIndex = index;
    }

    ScrollTrigger.create({
        trigger: ".swipe-section",
        pin: true,
        start: "bottom bottom",
        end: "0",
        onEnter: (self) => {
            if (intentObserver.isEnabled) {
                return
            }
            self.scroll(self.start +
                1);
            intentObserver.enable();
        },
        onEnterBack: (self) => {
            if (intentObserver.isEnabled) {
                return
            }
            self.scroll(self.end -
                1);
            intentObserver.enable();
        }
    });
}));