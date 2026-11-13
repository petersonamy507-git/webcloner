/** Portfolio vertical scroll animation — extracted from nypublishers.co/portfolio */
export const PORTFOLIO_BANNER_CSS = `
.portoflio-banner {
  background: #f5f8fc;
  overflow: hidden;
  position: relative;
}
.portoflio-banner > .container-fluid { position: relative; }
.portoflio-banner .row > .col-lg-6 { position: relative; z-index: 2; }
.portoflio-banner .portfolio-rows-wrapper {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: center;
  width: calc(100% + clamp(40px, 5vw, 96px));
  max-width: none;
}
.portoflio-banner .row > .col-lg-3:first-child .portfolio-rows-wrapper { margin-left: -120px; }
.portoflio-banner .row > .col-lg-3:last-child .portfolio-rows-wrapper {
  margin-right: clamp(-48px, -5vw, -20px);
  margin-left: auto;
}
.portoflio-banner .first-scroll-section,
.portoflio-banner .second-scroll-section {
  flex: 1 1 0;
  min-width: 0;
  height: 1120px;
  overflow: hidden;
}
.portoflio-banner .first-scroll-wrapper {
  display: flex;
  flex-direction: column;
}
.portoflio-banner .portoflio-banner__scroll-img {
  display: block;
  width: 100%;
  max-width: 220px;
  height: auto;
  margin: 0 auto 14px;
  object-fit: contain;
}
.first-scroll-section .first-scroll-wrapper {
  animation: clonerVerticalScrollReverse 20s linear infinite;
  will-change: transform;
}
.second-scroll-section .first-scroll-wrapper {
  animation: clonerVerticalScroll 20s linear infinite;
  will-change: transform;
}
@keyframes clonerVerticalScrollReverse {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
@keyframes clonerVerticalScroll {
  0% { transform: translateY(-50%); }
  100% { transform: translateY(0); }
}
.port-banner-content { text-align: center; margin-top: 145px; }
.port-banner-content h2 {
  font-weight: 600;
  font-size: clamp(32px, 4vw, 66px);
  line-height: 1;
  text-align: center;
  color: #192A3D;
}
.port-banner-content p {
  font-weight: 400;
  font-size: clamp(16px, 2vw, 24px);
  line-height: 1.2;
  text-align: center;
  margin-top: 17px;
}
.port-banner-review {
  width: 170px;
  height: 98px;
  margin: 25px auto 130px auto;
}
.port-banner-review img { width: 100%; height: auto; }
.portfolio-vertical-scroll-btn a {
  display: inline-block;
  background: #064877;
  color: #fff;
  padding: 12px 32px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
}
@media (max-width: 991px) {
  .portoflio-banner .portfolio-rows-wrapper { width: 100%; margin: 0 !important; }
  .portoflio-banner .first-scroll-section,
  .portoflio-banner .second-scroll-section { height: 600px; }
  .port-banner-content { margin-top: 60px; }
}
`;

export const SCROLL_DUPLICATE_SCRIPT = `
<script>
(function () {
  function dup() {
    document.querySelectorAll('.portoflio-banner .first-scroll-wrapper').forEach(function (wrapper) {
      if (wrapper.dataset.clonerDuped) return;
      wrapper.querySelectorAll('img').forEach(function (img) {
        wrapper.appendChild(img.cloneNode(true));
      });
      wrapper.dataset.clonerDuped = '1';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dup);
  else dup();
})();
</script>`;
