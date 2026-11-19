//Home page main banner slider
$('.home-logo-slider').slick({
    dots: false,
    infinite: false,
    arrows: false,    
    autoplay: true,
    speed: 300,
    slidesToShow: 4,
    infinite: true,
    slidesToScroll: 1,
    responsive: [
        {
            breakpoint: 992,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 1,
                dots: false
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 1
            }
        }
    ]
});


//Home page main banner slider End



//Signup page main banner slider
$('.testinomials-slider').slick({
    dots: false,
    arrows: false,
    autoplay: false,
    infinite:true,
    speed: 300,
    slidesToShow: 3,
    slidesToScroll: 1,
    centerMode: true,
    centerPadding:0,
    vertical: true,
    verticalSwiping: true,
    responsive: [
        {
            breakpoint: 1024,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1,                
            }
        },
        {
            breakpoint: 768,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 575,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1,
                centerMode: false,
                centerMode: false,
                vertical: false,
                verticalSwiping: false,
                arrows: false,
            }
        }
    ]
});


//Signup page main banner slider End


$('.members-slider').slick({
    dots: false,
    infinite: false,
    arrows: false,
    autoplay: true,
    speed: 300,
    slidesToShow: 6,
    infinite: true,
    slidesToScroll: 1,
    responsive: [
        {
            breakpoint: 1024,
            settings: {
                slidesToShow: 5,
                slidesToScroll: 1,
                dots: false
            }
        },
        {
            breakpoint: 600,
            settings: {
                slidesToShow: 4,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1
            }
        }
    ]
});



//Logo Slider 1 about us page

$('.logo-slider-1').slick({
    dots: false,
    infinite: true,
    autoplay: true,
    arrows: false,
    speed: 300,
    slidesToShow: 5,
    infinite: true,
    slidesToScroll: 1,
    responsive: [
        {
            breakpoint: 1024,
            settings: {
                slidesToShow: 5,
                slidesToScroll: 1,
                dots: false
            }
        },
        {
            breakpoint: 600,
            settings: {
                slidesToShow: 4,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1
            }
        }
    ]
});

//Accredited Institutes Slider
$('.ai-logo-slider ').slick({
    dots: false,
    variableWidth:false,
    infinite: true,
    autoplay: true,
    speed: 300,
    slidesToShow: 7,
    infinite: true,
    slidesToScroll: 1,
    responsive: [
        {
            breakpoint: 1024,
            settings: {
                slidesToShow: 5,
                slidesToScroll: 1,
                dots: false
            }
        },
        {
            breakpoint: 600,
            settings: {
                slidesToShow: 4,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1
            }
        }
    ]
});
//Accredited Institutes Slider End


//Accredited Institutes Slider
$('.services-slider').slick({
    dots: true,
    rows:2,
    infinite: true,
    arrows:false,
    autoplay: true,
    speed: 500,
    slidesToShow: 4,
    infinite: true,
    slidesToScroll: 2,
    responsive: [        
        {
            breakpoint: 992,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 768,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1
            }
        }
    ]
});
//Accredited Institutes Slider End



//Logo Slider 1 about us page End

//Choose Us Slider

$('.home-slider').slick({
    infinite: true,
    slidesToShow: 1,
    infinite: true,
    speed: 500,
    fade: !0,
    cssEase: 'linear',
    slidesToScroll: 1,
    dots: true,
    arrows: false,
    autoplay: true,
    autoplaySpeed: 8000,
    draggable: false,
});

//End



$('.portfolio-slider').slick({
    dots: true,
    arrows:false,
    slidesToShow: 4,
    slidesToScroll: 2,
    responsive: [
        {
            breakpoint: 1200,
            settings: {
                arrows: false,
                slidesToShow: 4
            }
        },
        {
            breakpoint: 768,
            settings: {
                arrows: false,
                slidesToShow: 2
            }
        },
        {
            breakpoint: 576,
            settings: {
                arrows: false,                
                slidesToShow: 1,
                slidesToScroll: 1,
            }
        }
    ]
});



//Blog Slider
$('.home-blogs-slider').slick({
    dots: true,
    arrows:false,
    infinite: true,
    autoplay: true,
    speed: 300,
    slidesToShow: 3,
    infinite: true,
    slidesToScroll: 1,
    responsive: [
        {
            breakpoint: 768,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 1
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1
            }
        }
    ]
});
//Blog Slider End


//Connet Slider
$('.connet-slider').slick({
    dots: true,
    arrows: true,
    slidesToShow: 3,
    slidesToScroll: 1,
    autoplay: true,
    infinite: true,
    autoplaySpeed:2500,
    prevArrow: '#prev-cont',
    nextArrow: '#next-cont',

    responsive: [
        {
            breakpoint: 1200,
            settings: {
                arrows: false,
                slidesToScroll: 1,
                slidesToShow: 2,

            }
        },
        {
            breakpoint:992,
            settings: {
                arrows: false,
                slidesToScroll: 1,
                slidesToShow: 2,
            }
        },
        {
            breakpoint: 767,
            settings: {
                arrows: false,
                slidesToScroll: 1,
                slidesToShow: 1,
            }
        }
    ]
});



//Review Slider

//$('.reviewer-slider').slick({
//    slidesToShow: 3,
//    slidesToScroll: 1,
//    asNavFor: '.review-slider',
//    dots: false,
//    arrows: false,
//    focusOnSelect: true,
//});
//$('.review-slider').slick({
//    slidesToShow: 1,
//    slidesToScroll: 1,
//    arrows: false,
//    fade: true,
//    asNavFor: '.reviewer-slider',
//    autoplay: true,
//    autoplaySpeed: 2000,
//});

//End



  // End

//Header Scroll Finction

//$(window).scroll(function () {
//    var nav = $('#navbarMain');
//    var top = 200;
//    if ($(window).scrollTop() >= top) {

//        nav.addClass('bg-nav');

//    } else {
//        nav.removeClass('bg-nav');
//    }
//});
//Header Scroll Finction End


//Counters Start
//new Counter('#example1', {
//    target: 1452,
//    type: 'numeric',
//    suffix: '+',
//    duration: 2500,
//});
//new Counter('#example2', {
//    target: 1200,
//    type: 'numeric',
//    suffix: '+',
//    duration: 2500,
//});
//new Counter('#example3', {
//    target: 10,
//    type: 'numeric',
//    suffix: '+',
//    duration: 2500,
//});
//new Counter('#example4', {
//    target: 50,
//    type: 'numeric',
//    suffix: '+',
//    duration: 2500,
//});
//Counters End

//back To top
var btn = $('#back-to-top');
$(window).scroll(function () {
    if ($(window).scrollTop() > 300) {
        btn.addClass('show');
    } else {
        btn.removeClass('show');
    }
});

btn.on('click', function (e) {
    e.preventDefault();
    $('html, body').animate({ scrollTop: 0 }, '300');
});

//back To top End

//auto tabs changer finction
//var tabChange = function () {
//    var tabs = $(".nav-pills > button");
//    var active = tabs.filter(".active");
//    var next = active.next("button").length
//        ? active.next("button")
//        : tabs.filter(":first-child");
//    next.tab("show");
//};
//var tabCycle = setInterval(tabChange, 3000);
//$(function () {
//    $(".nav-pills button").click(function (e) {
//        e.preventDefault();
//        clearInterval(tabCycle);
//        $(this).tab("show");
//        setTimeout(function () {
//            tabCycle = setInterval(tabChange, 3000);
//        }, 2000);
//    });
//});

//auto tabs changer finction

// JavaScript to open dropdown menus on hover
//const hoverDropdowns = document.querySelectorAll('.hover-dropdown');

//hoverDropdowns.forEach((hoverDropdown) => {
//    const triggerLink = hoverDropdown.querySelector('.dropdown-toggle');

//    triggerLink.addEventListener('mouseover', () => {
//        if (!hoverDropdown.classList.contains('show')) {
//            triggerLink.click(); // Open the dropdown on hover
//        }
//    });

//    triggerLink.addEventListener('mouseout', () => {
//        if (hoverDropdown.classList.contains('show')) {
//            triggerLink.click(); // Close the dropdown when mouse leaves
//        }
//    });
//});


// JavaScript to open and hide dropdown menus on hover

if ($(window).width() > 960) {

    const hoverDropdowns = document.querySelectorAll('.hover-dropdown');

    hoverDropdowns.forEach((hoverDropdown) => {
        const dropdownToggle = hoverDropdown.querySelector('.dropdown-toggle');
        const dropdownMenu = hoverDropdown.querySelector('.dropdown-menu');

        hoverDropdown.addEventListener('mouseover', () => {
            if (!dropdownMenu.classList.contains('show')) {
                dropdownMenu.classList.add('show'); // Show the dropdown on hover
            }
            if (!dropdownToggle.classList.contains('show')) {
                dropdownToggle.classList.add('show'); // Show the dropdown on hover
            }
        });

        hoverDropdown.addEventListener('mouseleave', () => {
            if (dropdownMenu.classList.contains('show')) {
                dropdownMenu.classList.remove('show'); // Hide the dropdown when mouse leaves
            }
            if (dropdownToggle.classList.contains('show')) {
                dropdownToggle.classList.remove('show'); // Hide the dropdown when mouse leaves
            }
        });
    });
    //alert('greater than 960');
}





//Mobile Menu Toggle Button

$(document).ready(function () {
    $('#nav-icon2').click(function () {
        $(this).toggleClass('open');
    });
});



$(window).scroll(function () {
    if ($(this).scrollTop() > 37) {
        $('.navbar').addClass('fixed-top bg-white bshadow');
    } else {
        $('.navbar').removeClass('fixed-top bg-white bshadow');
    }
});


// $(document).ready(function() {

   
//     $('#pass-value').click(function() {
        

//       var test = $(".p-pkg-box").html();
//       //var pkglist = $("#pkg-list1").html();
//       localStorage.setItem('data', test );
//       //localStorage.setItem('data1', pkglist );
//       window.location.href = 'package-details.html';
//     });
//   });


//   $(document).ready(function() {
//     var data = localStorage.getItem('data');
//    // var data1 = localStorage.getItem('data1');
//     $('.p-pkg-box').html(data);
//     //$('.pkg-list1').html(data1);
//   });






// jQuery(function ($) {
//     $(".navbar-nav a")
//         .click(function(e) {
//             var link = $(this);

//             var item = link;
            
//             if (item.hasClass("active")) {
//                 item.removeClass("active");
//             } else {
//                 item.addClass("active");
//             }

//             if (item.children(".navbar-nav").length > 0) {
//                 var href = link.attr("href");
//                 link.attr("href", "#");
//                 setTimeout(function () { 
//                     link.attr("href", href);
//                 }, 300);
//                 e.preventDefault();
//             }
//         })
//         .each(function() {
//             var link = $(this);
//             if (link.get(0).href === location.href) {
//                 link.addClass("active");
//                 return false;
//             }
//         });
// });




// Include header and Footer


// fetch("./header.html")
//   .then(response => {
//     return response.text()
//   })
//   .then(data => {
//     document.querySelector("header").innerHTML = data;
//   });

// fetch("./footer.html")
//   .then(response => {
//     return response.text()
// })
//   .then(data => {
//     document.querySelector("footer").innerHTML = data;
// });



window.setInterval(popupFun, 2500);

function popupFun() {
    var a = $(".ecosys_icnbx.add_tarans").index();
    if ($(".ecosys_icnbx").hasClass("add_tarans") && a < 5) {
        a = a + 1;
        $(".ecosys_icnbx").removeClass("add_tarans");
        $(".ecosys_icnbx").eq(a).addClass("add_tarans")
    } else {
        $(".ecosys_icnbx").removeClass("add_tarans");
        $(".ecosys_icnbx").eq(0).addClass("add_tarans")
    }
}

$(".modal").each(function (l) {
    $(this).on("show.bs.modal", function (l) {
        var o = $(this).attr("data-easein");
        "shake" == o ? $(".modal-dialog").velocity("callout." + o) : "pulse" == o ? $(".modal-dialog").velocity("callout." + o) : "tada" == o ? $(".modal-dialog").velocity("callout." + o) : "flash" == o ? $(".modal-dialog").velocity("callout." + o) : "bounce" == o ? $(".modal-dialog").velocity("callout." + o) : "swing" == o ? $(".modal-dialog").velocity("callout." + o) : $(".modal-dialog").velocity("transition." + o)
    })
});





// Fancybox Config
/*
$('[data-fancybox="gallery"]').fancybox({
    buttons: [
        "slideShow",
        "thumbs",
        "zoom",
        "fullScreen",
        "share",
        "close"
    ],
    loop: false,
    protect: true
});
*/

