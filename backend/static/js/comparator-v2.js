var geopsg = geopsg || {};
geopsg.comparator = (options) => {
  const maps = [];
  const MODES = {
    SIDE_BY_SIDE: 'sbs',
    SPLIT: 'split'
  };
  let sbsCtrl;
  new Vue({
    el: '#js-app-comparator',
    data: () => {
      return {
        MODES: MODES,
        curMode: MODES.SIDE_BY_SIDE,
        modeBtns: [{
          name: MODES.SIDE_BY_SIDE,
          label: "Superposé",
          active: true
        }, {
          name: MODES.SPLIT,
          label: "Côte à côte",
          active: false
        }],
        photos: options.photos,
        comparedPhotos: [
          options.photos[0],
          options.photos[options.photos.length - 1]
        ]
      }
    },
    mounted() {
      this.initMaps();
    },
    methods: {
      initMaps() {
        maps.push(this.initMap(1));
        maps.push(this.initMap(2));

        maps[0].sync(maps[1]);
        maps[1].sync(maps[0]);

        // Init L.control.sideBySide
        maps[0].createPane('left');
        maps[0].createPane('right');

        this.updateLayers();
      },
      initMap(num) {
        const map = L.map(this.$refs['photo' + num], {
          zoomControl: false,
          crs: L.CRS.Simple,
          center: [0, 0],
          zoom: 0,
          zoomSnap: 0.25,
          minZoom: -5
        });
        map.attributionControl.setPrefix('');

        return map;
      },
      onBtnModeClick(curBtn) {
        for (const btn of this.modeBtns) {
          btn.active = btn.name == curBtn.name;
        }
        this.curMode = curBtn.name;
        this.updateLayers();
      },
      onPhotoSelected(index, photo) {
        this.$set(this.comparedPhotos, index, photo);
        //this.comparedPhotos[index] = photo;
        this.updateLayers();
      },
      updateLayers() {
        this.clearMaps();

        Promise.all([
          this.loadImg(this.comparedPhotos[0].filename),
          this.loadImg(this.comparedPhotos[1].filename)
        ])
          .then(imgs => {
            const layers = [];
            imgs.forEach((img, i) => {
              const imgW = img.width;
              const imgH = img.height;
              layers.push(
                L.imageOverlay(img.src, [[-imgH / 2, -imgW / 2], [imgH / 2, imgW / 2]])
              );
            });
            if (sbsCtrl) {
              maps[0].removeControl(sbsCtrl);
              sbsCtrl = null;
            }
            if (this.curMode == MODES.SPLIT) {
              layers[0].addTo(maps[0]);
              layers[1].addTo(maps[1]);
            } else if (this.curMode == MODES.SIDE_BY_SIDE) {
              layers[0].options.pane = 'left';
              layers[1].options.pane = 'right';
              layers[0].addTo(maps[0]);
              layers[1].addTo(maps[0]);
              sbsCtrl = L.control.sideBySide(layers[0], layers[1]).addTo(maps[0]);
            }
            this.resizeMaps();
            maps[0].fitBounds(maps[0].getBounds());
          });
      },
      loadImg(filename) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = function() {
            resolve(this);
          };
          img.src = '/static/data/images/' + filename;
        });
      },
      clearMaps() {
        maps.forEach(map => {
          map.eachLayer((layer) => {
            map.removeLayer(layer);
          });
        });
      },
      resizeMaps() {
        maps.forEach(map => {
          map.eachLayer((layer) => {
            map.invalidateSize();
          });
        });
      }
    }
  })
}
