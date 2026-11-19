(function ($) {
  'use strict';

  function slickSetPositionEach($sliders) {
    $sliders.each(function () {
      var $s = $(this);
      if ($s.hasClass('slick-initialized')) {
        $s.slick('setPosition');
      }
    });
  }

  function initBannerMarquee() {
    var $sliders = $('.js-banner-marquee-slider');
    if (!$sliders.length || typeof $.fn.slick !== 'function') {
      return;
    }

    var reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    $sliders.each(function () {
      var $slider = $(this);
      if ($slider.hasClass('slick-initialized')) {
        return;
      }
      $slider.slick({
        infinite: true,
        autoplay: !reducedMotion,
        autoplaySpeed: 1,
        speed: 18000,
        cssEase: 'linear',
        slidesToShow: 1,
        slidesToScroll: 1,
        arrows: false,
        dots: false,
        pauseOnHover: true,
        pauseOnFocus: true,
        swipe: true,
        touchMove: true,
        draggable: false,
        adaptiveHeight: false,
        variableWidth: true,
        accessibility: true,

        rtl: false
      });
    });

    $(window).on('load', function () {
      slickSetPositionEach($sliders);
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        slickSetPositionEach($sliders);
      });
    });
    setTimeout(function () {
      slickSetPositionEach($sliders);
    }, 150);
  }

  function initBrandMarquee() {
    var $sliders = $('.js-brand-marquee-slider');
    if (!$sliders.length || typeof $.fn.slick !== 'function') {
      return;
    }

    var reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    $sliders.each(function () {
      var $slider = $(this);
      if ($slider.hasClass('slick-initialized')) {
        return;
      }
      $slider.slick({
        infinite: true,
        centerMode: true,
        centerPadding: '12%',
        slidesToShow: 3,
        slidesToScroll: 1,
        autoplay: !reducedMotion,
        autoplaySpeed: 1,
        speed: 6000,
        cssEase: 'linear',
        waitForAnimate: false,
        arrows: false,
        dots: false,
        pauseOnHover: true,
        pauseOnFocus: true,
        swipe: true,
        touchMove: true,
        draggable: false,
        adaptiveHeight: false,
        accessibility: true,
        focusOnSelect: false,
        responsive: [
          {
            breakpoint: 1200,
            settings: {
              infinite: true,
              centerPadding: '10%',
              slidesToShow: 3
            }
          },
          {
            breakpoint: 768,
            settings: {
              infinite: true,
              centerMode: true,
              centerPadding: '18%',
              slidesToShow: 1
            }
          }
        ]
      });

      $slider.find('img').each(function () {
        var img = this;
        function refresh() {
          slickSetPositionEach($slider);
          if (!reducedMotion && $slider.hasClass('slick-initialized')) {
            try {
              $slider.slick('slickPlay');
            } catch (e) {
              /* noop */
            }
          }
        }
        if (img.complete && img.naturalWidth > 0) {
          setTimeout(refresh, 0);
        } else {
          $(img).one('load error', refresh);
        }
      });

      if (!reducedMotion) {
        [250, 700].forEach(function (ms) {
          setTimeout(function () {
            if (!$slider.hasClass('slick-initialized')) {
              return;
            }
            slickSetPositionEach($slider);
            try {
              $slider.slick('slickPlay');
            } catch (e) {
              /* noop */
            }
          }, ms);
        });
      }
    });

    $(window).on('load', function () {
      slickSetPositionEach($sliders);
      if (!reducedMotion) {
        $sliders.each(function () {
          var $s = $(this);
          if ($s.hasClass('slick-initialized')) {
            try {
              $s.slick('slickPlay');
            } catch (e) {
              /* noop */
            }
          }
        });
      }
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        slickSetPositionEach($sliders);
      });
    });
    setTimeout(function () {
      slickSetPositionEach($sliders);
    }, 150);
  }

  function initSec3Tabs() {
    $(document).on('click', '.js-sec-3 .sec_3-tab', function () {
      var $btn = $(this);
      var idx = Number($btn.data('tab'));
      if (Number.isNaN(idx)) {
        idx = $btn.index();
      }
      var $wrap = $btn.closest('.sec_3-tabs-wrap');
      $wrap.find('.sec_3-tab').removeClass('is-active').attr('aria-selected', 'false');
      $btn.addClass('is-active').attr('aria-selected', 'true');
      var $panels = $wrap.find('.sec_3-panel');
      $panels.removeClass('is-active').attr('hidden', true);
      $panels.eq(idx).addClass('is-active').removeAttr('hidden');
    });
  }

  function initSec3Scroll() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      return;
    }
    var section = document.querySelector('.js-sec-3');
    if (!section) {
      return;
    }

    var reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      section.classList.add('sec_3-static');
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    function pinAndReveal() {
      var heading = section.querySelector('[data-sec3="heading"]');
      var tabs = section.querySelectorAll('.sec_3-tab');
      if (!heading || !tabs.length) {
        return;
      }

      var endDistance = function () {
        return '+=' + Math.round(window.innerHeight * 2.75);
      };

      var tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: endDistance,
          pin: true,
          scrub: 0.7,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      // First ~50% of timeline: heading only; then tabs stagger into place
      tl.fromTo(
        heading,
        { opacity: 0, y: 72 },
        { opacity: 1, y: 0, ease: 'power3.out', duration: 10 },
        0
      );
      tl.fromTo(
        tabs,
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.38,
          ease: 'power2.out',
          duration: 9
        },
        10
      );
    }

    var mm = gsap.matchMedia();
    mm.add('(min-width: 992px)', function () {
      section.classList.remove('sec_3-static');
      pinAndReveal();
    });
    mm.add('(max-width: 991px)', function () {
      section.classList.add('sec_3-static');
    });

    $(window).on('load', function () {
      ScrollTrigger.refresh();
    });
  }

  function initHeaderScroll() {
    var header = document.getElementById('siteHeader');
    if (!header) {
      return;
    }

    var ticking = false;
    var threshold = 30;

    function updateHeaderState() {
      var scrolled = window.scrollY > threshold;
      header.classList.toggle('is-scrolled', scrolled);
      ticking = false;
    }

    function onScroll() {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(updateHeaderState);
    }

    updateHeaderState();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function initAboutTeamSlider() {
    var $slider = $('.js-about-team-slider');
    if (!$slider.length || typeof $.fn.slick !== 'function') {
      return;
    }
    if ($slider.hasClass('slick-initialized')) {
      return;
    }

    $slider.slick({
      infinite: true,
      arrows: false,
      dots: true,
      centerMode: true,
      centerPadding: '0px',
      slidesToShow: 3,
      slidesToScroll: 1,
      initialSlide: 1,
      autoplay: true,
      autoplaySpeed: 6000,
      speed: 700,
      pauseOnHover: true,
      pauseOnFocus: true,
      waitForAnimate: false,
      adaptiveHeight: false,
      responsive: [
        {
          breakpoint: 992,
          settings: {
            centerMode: false,
            slidesToShow: 2,
            slidesToScroll: 1
          }
        },
        {
          breakpoint: 768,
          settings: {
            centerMode: false,
            slidesToShow: 1,
            slidesToScroll: 1
          }
        }
      ]
    });
  }

  function initPortfolioSlider() {
    if (typeof $.fn.slick !== 'function') {
      return;
    }

    var slickOptions = {
      slidesToShow: 4,
      slidesToScroll: 1,
      arrows: true,
      dots: true,
      infinite: true,
      autoplay: true,
      autoplaySpeed: 4000,
      responsive: [
        { breakpoint: 1200, settings: { slidesToShow: 3 } },
        { breakpoint: 992, settings: { slidesToShow: 2 } },
        { breakpoint: 576, settings: { slidesToShow: 1 } }
      ]
    };

    function startSlider($slider) {
      if (!$slider.length || $slider.children().length < 1) {
        return;
      }
      if (!$slider.hasClass('slick-initialized')) {
        $slider.slick(slickOptions);
      } else {
        $slider.slick('setPosition');
      }
    }

    var tabSliders = {
      '#tab2': $('#portfolioSliderCovers'),
      '#tab3': $('#portfolioSliderIllustrations')
    };

    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
      var target = $(e.target).attr('data-bs-target');
      if (tabSliders[target]) {
        setTimeout(function () {
          startSlider(tabSliders[target]);
        }, 150);
      }
    });
  }

  $(function () {
    initBrandMarquee();
    initBannerMarquee();
    initSec3Tabs();
    initSec3Scroll();
    initHeaderScroll();
    initAboutTeamSlider();
    initPortfolioSlider();
  });
})(jQuery);
