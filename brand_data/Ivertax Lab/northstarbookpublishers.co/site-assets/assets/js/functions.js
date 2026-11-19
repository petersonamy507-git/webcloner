$(document).ready(function () {

    setTimeout(function () {

        $('#triggerClick').trigger("click");

    }, 5000);

    //responsive menu
    $(".menu-bottom").on("click", function () {
        $("html").toggleClass("menu-open")
    });
    $(".menu-bottom").click(function () {
        $(this).toggleClass("click")
    });

    AOS.init({ disable: 'mobile' });

    /*PORTFOLIO*/
    $('.various').click(function () {
        var leadprice = $(this).attr('name');
        $(".popupform .leadprice").val(leadprice)
    });
});

$(document).ready(function () {
    $('*[data-tab="editing"], #editing').addClass("current");

    var typed = new Typed("#typed", {
        stringsElement: "#typed-strings",
        typeSpeed: 70,
        backSpeed: 30,
        contentType: "text",
        startDelay: 1000,
        backDelay: 2700,
        loop: true,
     });

});

  // Reviews Social Media Slider JS Start Here
  $('.reviews-socialmedia-items').owlCarousel({
    loop: true,
    margin: 10,
    nav: true,
    nav: false,
    dots: false,
    autoplay: true,
    autoplaySpeed: 2000,
    responsive: {
      0: {
        items: 1
      },
      768: {
        items: 2
      },
      1024: {
        items: 2
      },
      1200: {
        items: 3
      }
    }
  })
  // Reviews Social Media Slider JS End Here


    // Testimonial Slidee JS Start Here
    $('.customer-feedback-slider').owlCarousel({
        loop: true,
        margin: 10,
        nav: true,
        dots: false,
        autoplay: false,
        autoplaySpeed: 2000,
        responsive: {
          0: {
            items: 1
          },
          768: {
            items: 1
          },
          1024: {
            items: 2
          },
          1200: {
            items: 2
          }
        }
      })
      //  Testimonial Slideea JS End Here

      //***** Counter Timer JS Start Here *****//
$.fn.jQuerySimpleCounter = function (options) {
    var settings = $.extend({
      start: 0,
      end: 100,
      easing: 'swing',
      duration: 400,
      complete: '',
      point_tag: 0
    }, options);
  
    var thisElement = $(this);
  
    $({ count: settings.start }).animate({ count: settings.end }, {
      duration: settings.duration,
      easing: settings.easing,
      point_tag: settings.point_tag,
      step: function () {
  
        if (settings.point_tag == 1) {
  
          var mathCount = parseFloat(this.count).toFixed(1);
  
        } else {
  
          var mathCount = Math.ceil(this.count);
        }
        thisElement.text(mathCount);
  
      },
      complete: settings.complete
    });
  };
  
  $('#number1').jQuerySimpleCounter({ end: parseFloat($('#number1').text()), duration: 2000, point_tag: 0 });
  $('#number2').jQuerySimpleCounter({ end: parseInt($('#number2').text()), duration: 5000, point_tag: 0 });
  $('#number3').jQuerySimpleCounter({ end: parseInt($('#number3').text()), duration: 3000, point_tag: 0 });
  $('#number4').jQuerySimpleCounter({ end: parseInt($('#number4').text()), duration: 4000, point_tag: 0 });
  $('#number5').jQuerySimpleCounter({ end: parseInt($('#number5').text()), duration: 5000, point_tag: 0 });
  //***** Counter Timer JS End Here *****//
  
  
  //*****  Award Brands Slider JS Start Here *****//
$('.award-brands-wrap-service-sec .award-brands-slider').slick({
  dots: false,
  arrows: false,
  infinite: true,
  speed: 500,
  slidesToShow: 5,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 1000,
  responsive: [
    {
      breakpoint: 1200,
      settings: {
        slidesToShow: 4,
        slidesToScroll: 1,
        infinite: true,
        dots: false
      }
    },
    {
      breakpoint: 992,
      settings: {
        slidesToShow: 3,
        slidesToScroll: 1,
        infinite: true,
        dots: false
      }
    },
    {
      breakpoint: 768,
      settings: {
        slidesToShow: 3,
        slidesToScroll: 1
      }
    },
    {
      breakpoint: 576,
      settings: {
        slidesToShow: 2,
        slidesToScroll: 1
      }
    }

  ]
});
//***** Award Brands Slider JS End Here *****//

//***** Cutomer Feedback Slider JS Start Here *****//
$('.testimonials-serv-slider').slick({
  dots: false,
  arrows: true,
  infinite: true,
  centerMode: true,
  autoplay: false,
  speed: 500,
  centerPadding: "10px",
  slidesToShow: 3,
  slidesToScroll: 1,
  autoplaySpeed: 2000,
  responsive: [
    {
      breakpoint: 1200,
      settings: {
        slidesToShow: 2,
        slidesToScroll: 1
      }
    },
    {
      breakpoint: 992,
      settings: {
        slidesToShow: 2,
        slidesToScroll: 1
      }
    },
    {
      breakpoint: 768,
      settings: {
        slidesToShow: 1,
        slidesToScroll: 1
      }
    },
    {
      breakpoint: 576,
      settings: {
        slidesToShow: 1,
        slidesToScroll: 1
      }
    }

  ]
});
//***** Cutomer Feedback Slider JS End Here *****//

// Video Testimonials Slider JS Start Here
    $('.video-testimonials-slider').owlCarousel({
        loop: true,
        margin: 10,
        nav: false,
        dots: false,
        autoplay: true,
        autoplaySpeed: 2000,
        responsive: {
          0: {
            items: 1
          },
          768: {
            items: 1
          },
          1024: {
            items: 2
          },
          1200: {
            items: 3
          }
        }
      })
// Video Testimonial Slider JS End Here

