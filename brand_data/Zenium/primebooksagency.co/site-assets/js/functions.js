$(document).ready(function () {

    AOS.init();
    AOS.init({ disable: 'mobile' });
    $(".menu-btn").click(function () {
        $(".mobile-In").fadeIn();
        $(".mobile-In").css("transform", "translateX(0px)");
    });
    $(".close-btn").click(function () {
        $(".mobile-In").fadeOut();
        $(".mobile-In").css("transform", "translateX(2000px)");
    });
    $('.port-slider-one').owlCarousel({
        loop: true,
        nav: false,
        stopOnHover: false,
        autoplayHoverPause: false,
        dots: false,
        margin: 0,
        responsiveClass: true,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplaySpeed: 800,

        responsive: {
            0: {
                items: 1,
            },
            600: {
                items: 1,
            },
            1000: {
                items: 3,
            },
            360: {
                items: 1
            }
        }
    });
    $('.slider-logo_s').owlCarousel({
        loop: true,
        nav: false,
        stopOnHover: false,
        autoplayHoverPause: false,
        dots: false,
        margin: 15,
        responsiveClass: true,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplaySpeed: 800,
        responsive: {
            0: {
                items: 1,
            },
            600: {
                items: 3,
            },
            1000: {
                items: 4,
            },
            360: {
                items: 1
            }
        }
    });
    $('.slider-graph_s').owlCarousel({
        loop: true,
        nav: false,
        stopOnHover: false,
        autoplayHoverPause: false,
        dots: true,
        margin: 15,
        responsiveClass: true,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplaySpeed: 800,
        responsive: {
            0: {
                items: 1,
            },
            600: {
                items: 2,
            },
            1000: {
                items: 3,
            },
            360: {
                items: 1
            }
        }
    });
    $('.slider-gray-logo_s').owlCarousel({
        loop: true,
        nav: false,
        stopOnHover: false,
        autoplayHoverPause: false,
        dots: true,
        margin: 15,
        responsiveClass: true,
        autoplay: true,
        slideTransition: 'linear',
        autoplayTimeout: 1000,
        autoplaySpeed: 15000,
        responsive: {
            0: {
                items: 1,
            },
            600: {
                items: 4,
            },
            1000: {
                items: 6,
            },
            360: {
                items: 1
            }
        }
    });
    var offset = $(".nav-bar").offset();
    checkOffset();

    $(window).scroll(function () {
        checkOffset();
    });

    function checkOffset() {
        if ($(document).scrollTop() > offset.top) {
            $('.nav-bar').addClass('sticky-nav-bar');
        } else {
            $('.nav-bar').removeClass('sticky-nav-bar');
        }
    }
    // ******************************************************
    // When the switch button is toggled
    $("#mySwitch").on("change", function () {
        // If the switch is on
        if ($(this).is(":checked")) {
            // Show the section that will change
            $("#mySection").show();
        } else {
            // Hide the section that will change
            $("#mySection").hide();
        }
    });

    // ******************************************************
    // Validation Form******************************************
    $(".validate-b-form").validate({});
    $(".validate-popup-form").validate({});
    $(".validate-letsget").validate({});
    $(".contact-form").validate({});
    // End Validation***********************************
    $('#list-btn').click(function () {
        document.getElementById('list-btn').style.display = "none";
        document.getElementById('cross').style.display = "block";
        document.getElementById('menu-list').style.left = "0px";
        // document.getElementById('form-cross').style.display = "none";
        // document.getElementById('cpyRight-cross').style.display = "none";
    });
    $('#cross').click(function () {
        document.getElementById('list-btn').style.display = "block";
        document.getElementById('cross').style.display = "none";
        document.getElementById('menu-list').style.left = "150%";
        // document.getElementById('form-cross').style.display = "block";
        // document.getElementById('cpyRight-cross').style.display = "none";
    });

    // Arrow Btn goto up
    var scrollBtn = $('#goto-top');
    $(window).scroll(function () {
        if ($(window).scrollTop() > 300) {
            scrollBtn.addClass('show');
        } else {
            scrollBtn.removeClass('show');
        }
    });
    scrollBtn.on('click', function (e) {
        e.preventDefault();
        $('html, body').animate({ scrollTop: 0 }, '300');
    });
    var path = window.location.href;
    $("#menu-list .menu li a").each(function () {
        this.href === path && $(this).addClass("active");
    });
});