import { Component, OnInit, OnDestroy } from '@angular/core';
import { SitesService } from '../services/sites.service';
import { HttpEventType } from '@angular/common/http';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { FormGroup } from '@angular/forms';
import { tileLayer, latLng, Map, Layer } from 'leaflet';
import { FormService } from '../services/form.service';
import { Conf } from './../config';
import * as L from 'leaflet';
import * as _ from 'lodash';
import { ToastrService } from 'ngx-toastr';
import { forkJoin } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NgxSpinnerService } from 'ngx-spinner';
import { ObservatoriesService } from '../services/observatories.service';
import { ObservatoryType } from '../types';
import { DbConfService, IDBConf } from '../services/dbconf.service';
import { ToolbarService, LinkService, ImageService, HtmlEditorService } from '@syncfusion/ej2-angular-richtexteditor';
import { TranslateService } from '@ngx-translate/core';
import { switchMap, tap } from 'rxjs/operators';

@Component({
  selector: 'app-add-site',
  templateUrl: './add-site.component.html',
  styleUrls: ['./add-site.component.scss'],
  providers: [ToolbarService, LinkService, ImageService, HtmlEditorService],
})
export class AddSiteComponent implements OnInit, OnDestroy {
  /* RichTextEditor toolbar configuration --> Hide image upload tool */
  public tools: object = {
    type: 'Expand',
    items: ['Bold', 'Italic', 'Underline', 'StrikeThrough',
      'FontName', 'FontSize', 'FontColor', 'BackgroundColor',
      'LowerCase', 'UpperCase', '|',
      'Formats', 'Alignments', 'OrderedList', 'UnorderedList',
      'Outdent', 'Indent', '|',
      'CreateLink',
      /*'Image', */
      '|', 'ClearFormat', 'Print',
      'SourceCode', 'FullScreen', '|', 'Undo', 'Redo']
  };
  selectedFile: File[];
  modalRef: NgbModalRef;
  selectedSubthemes = [];
  photos = [];
  noticeName: any;
  new_notice: any;
  siteForm: FormGroup;
  siteJson;
  themes: any;
  subthemes: any;
  loadForm = false;
  map;
  mySubscription;
  id_site = null;
  drawnItems = new L.FeatureGroup();
  markerCoordinates = [];
  icon = L.icon({
    iconSize: [25, 41],
    iconAnchor: [13, 41],
    iconUrl: './assets/marker-icon.png',
    shadowUrl: './assets/marker-shadow.png',
  });
  options = {
    layers: [tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')],
    zoom: 10,
    center: latLng(Conf.map_lat_center, Conf.map_lan_center),
  };
  drawOptions = {
    position: 'topleft',
    draw: {
      polygon: false,
      circle: false,
      rectangle: false,
      polyline: false,
      circlemarker: false,
      marker: {
        icon: this.icon,
      },
    },
    edit: {
      featureGroup: this.drawnItems,
    },
  };
  drawControl = new L.Control.Draw();
  previewImage: string | ArrayBuffer;
  alert: { type: string; message: string };
  site: any;
  edit_btn = false;
  edit_btn_text = 'BUTTONS.EDIT';
  submit_btn_text = 'BUTTONS.ADD';
  initPhotos: any[] = [];
  deleted_photos = [];
  new_photos = [];
  marker: Layer[] = [];
  center: any;
  toast_msg: string;
  communes: undefined;
  observatories: ObservatoryType[] = [];
  currentUser: any;
  zoom = 10;
  removed_notice: any = null;
  constructor(
    private sitesService: SitesService,
    private observatoriesSrv: ObservatoriesService,
    public formService: FormService,
    protected router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private modalService: NgbModal,
    private authService: AuthService,
    private spinner: NgxSpinnerService,
    private dbConfSrv: DbConfService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.currentUser;
    this.id_site = this.route.snapshot.params['id'];
    this.siteForm = this.formService.initFormSite();
    this.siteForm.controls['id_stheme'].disable();
    forkJoin([
      this.sitesService.getThemes(),
      this.sitesService.getSubthemes(),
      this.sitesService.getCommunes(),
      this.observatoriesSrv.getAll(),
    ]).subscribe((results) => {
      this.themes = results[0];
      this.subthemes = results[1];
      this.communes = results[2];
      this.selectedSubthemes = this.subthemes;
      this.observatories = results[3];
      if (this.id_site) {
        this.getSite(this.id_site);
        this.submit_btn_text = 'BUTTONS.SUBMIT';
      } else {
        this.edit_btn = true;
        this.loadForm = true;
        this.themes_onChange();
        this.latlan_onChange();
      }
    });
  }

  onMapReady(map: Map) {
    L.control.scale().addTo(map);
    const street = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    );
    let layersConf: IDBConf['map_layers'] = _.get(
      this.dbConfSrv.conf,
      'map_layers',
      []
    );
    if (!Array.isArray(layersConf)) {
      layersConf = [];
    }
    if (!layersConf.length) {
      layersConf.push({
        label: 'OSM classic',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
          maxZoom: 18,
          attribution:
            '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      });
    }
    const baseLayers = {};
    layersConf.forEach((layerConf) => {
      baseLayers[layerConf.label] = L.tileLayer(
        layerConf.url,
        layerConf.options
      );
    });
    L.control.layers(baseLayers).addTo(map);
    const info = new L.Control();
    info.setPosition('topleft');
    info.onAdd = () => {
      const container = L.DomUtil.create(
        'button',
        ' btn btn-sm btn-outline-shadow leaflet-bar leaflet-control '
      );
      container.innerHTML =
        '<i style="line-height: unset" class="icon-full_screen"> </i>';
      container.style.backgroundColor = 'white';
      this.translate.get('INFO_MESSAGE.RECENTER_MAP').subscribe((translatedMessage) => {
        container.title = translatedMessage;
      })
      container.onclick = () => {
        this.center = latLng(this.site.geom);
        this.zoom = 10;
      };
      return container;
    };
    info.addTo(map);
    map.addLayer(this.drawnItems);
    L.EditToolbar.Delete.include({
      removeAllLayers: false,
    });
    this.map = map;
    map.on(L.Draw.Event.CREATED, (event) => {
      const layer = (event as any).layer;
      this.markerCoordinates.push(layer._latlng);
      this.siteForm.controls['lat'].setValue(
        this.markerCoordinates[0].lat.toFixed(6)
      );
      this.siteForm.controls['lng'].setValue(
        this.markerCoordinates[0].lng.toFixed(6)
      );
      this.drawControl.setDrawingOptions({
        marker: false,
      });
      map.removeControl(this.drawControl);
      map.addControl(this.drawControl);
    });

    map.on(L.Draw.Event.EDITED, (event) => {
      let layer = (event as any).layers._layers;
      layer = layer[Object.keys(layer)[0]];
      this.markerCoordinates.push(layer._latlng);
      this.siteForm.controls['lat'].setValue(
        this.markerCoordinates[0].lat.toFixed(6)
      );
      this.siteForm.controls['lng'].setValue(
        this.markerCoordinates[0].lng.toFixed(6)
      );
    });
    map.on(L.Draw.Event.DELETED, (event) => {
      const markers = [];
      map.eachLayer((layer: any) => {
        if (layer._latlng) {
          markers.push(layer._latlng);
        }
      });
      if (markers.length === 0) {
        this.siteForm.controls['lat'].reset();
        this.siteForm.controls['lng'].reset();
        this.markerCoordinates = [];
        map.removeControl(this.drawControl);
        this.drawControl.setDrawingOptions({
          marker: {
            icon: this.icon,
          },
        });
        map.addControl(this.drawControl);
      }
    });
  }

  onDrawReady(drawControl) {
    this.drawControl = drawControl;
    if (this.id_site) {
      this.map.removeControl(this.drawControl);
    }
  }

  noticeSelect(event) {
    this.selectedFile = event.target.files;
    if (event.target.files && event.target.files.length > 0) {
      this.noticeName = event.target.files[0].name;
    }
  }

  removeNotice() {
    this.removed_notice = this.noticeName;
    this.noticeName = null;
    this.siteForm.controls['notice'].reset();
    this.selectedFile = null;
  }

  uploadNotice() {
    const notice: FormData = new FormData();
    if (this.selectedFile) {
      notice.append('notice', this.selectedFile[0], this.selectedFile[0].name);
      this.sitesService.addNotices(notice).subscribe();
    } else {
      if (!this.noticeName) {
        this.sitesService.deleteNotices(this.removed_notice).subscribe();
      }
    }
  }

  submitSite(siteForm) {
    this.alert = null;
    this.edit_btn = false;
    let path_file_guide_site = null;
    if (this.selectedFile) {
      path_file_guide_site = this.selectedFile[0].name;
    } else {
      path_file_guide_site = this.noticeName;
    }
    if (siteForm.valid) {
      this.siteJson = _.omit(siteForm.value, [
        'id_theme',
        'notice',
        'lat',
        'lng',
        'id_stheme',
      ]);
      this.siteJson.geom =
        'SRID=4326;POINT(' +
        siteForm.value.lng +
        ' ' +
        siteForm.value.lat +
        ')';
      this.siteJson.path_file_guide_site = path_file_guide_site;
      this.uploadNotice();
      this.spinner.show();
      if (!this.id_site) {
        this.sitesService.addSite(this.siteJson).subscribe(
          (site) => {
            // tslint:disable-next-line:quotemark
            this.translate.get("INFO_MESSAGE.SUCESS_ADDED_SITE").subscribe((translatedMessage: string) => {
            this.toast_msg = translatedMessage;
            })
            this.addThemes(
              Number(site.id_site),
              siteForm.value.id_theme,
              siteForm.value.id_stheme,
              true
            );
          },
          (err) => {
            this.spinner.hide();
            this.edit_btn = true;
            if (err.status === 403) {
              this.router.navigate(['']);
          this.translate.get('ERRORS.EXPIRED_SESSION').subscribe((translatedMessage: string) => {
            this.toastr.error(translatedMessage, '', {
              positionClass: 'toast-bottom-right',
            });
          })
        } else
        this.translate.get('ERRORS.SERVER_ERROR').subscribe((translatedMessage: string) => {
          this.toastr.error(translatedMessage, '', {
            positionClass: 'toast-bottom-right',
          });
        })
          }
        );
      } else {
        this.patchSite(
          this.siteJson,
          siteForm.value.id_theme,
          siteForm.value.id_stheme
        );
      }
    } else {
      this.edit_btn = true;
    }
  }

  getPhoto(photo) {
    this.alert = null;
    const reader = new FileReader();
    reader.readAsDataURL(photo.photo_file[0]);
    reader.onload = () => {
      this.previewImage = reader.result;
      photo.imgUrl = this.previewImage;
    };
    photo.name = photo.path_file_photo;
    photo.filePhoto = photo.photo_file[0];
    this.photos.push(photo);
  }

  addPhotos(id_site, new_site) {
    const photosData: FormData = new FormData();
    let photoJson;
    let photos;
    if (this.id_site) {
      photos = this.new_photos;
    } else {
      photos = this.photos;
    }
    _.forEach(photos, (photo) => {
      photoJson = _.omit(photo, ['photo_file', 'imgUrl', 'filePhoto', 'name']);
      photoJson.id_site = Number(id_site);
      photosData.append('image', photo.filePhoto);
      photosData.append('new_site', new_site);
      photosData.append('data', JSON.stringify(photoJson));
    });
    if (photos.length > 0) {
      this.sitesService.addPhotos(photosData).subscribe(
        (res) => {
          if (res.type === HttpEventType.UploadProgress) {
            // console.log('resUplod', res.loaded);
          }
        },
        (err) => {
          console.log('err upload photo', err);
          this.spinner.hide();
          if (err.error.error === 'image_already_exist') {
            this.edit_btn_text = 'BUTTONS.CANCEL';
            this.edit_btn = true;
            this.setAlert(err.error.image);
          } else if (err.status === 403) {
            this.translate.get('ERRORS.SESSION_EXPIRED').subscribe((translatedMessage: string) => {
              this.router.navigate(['']);
              this.toastr.error(translatedMessage, '', {
                positionClass: 'toast-bottom-right',
              });
            });
          } else {
            this.translate.get('ERRORS.SERVER_ERROR').subscribe((translatedMessage: string) => {
              this.toastr.error(translatedMessage, '', {
                positionClass: 'toast-bottom-right',
              });
            });
          }
        },
        () => {
          this.siteForm.disable();
          this.spinner.hide();
          this.toastr.success(this.toast_msg, '', {
            positionClass: 'toast-bottom-right',
          });
          // ###### can reload the same route #######
          this.router.routeReuseStrategy.shouldReuseRoute = function () {
            return false;
          };
          this.mySubscription = this.router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
              this.router.navigated = false;
            }
          });
          // ##########
          this.router.navigate(['/sites/details/', id_site]);
        }
      );
    } else {
      this.siteForm.disable();
      this.toastr.success(this.toast_msg, '', {
        positionClass: 'toast-bottom-right',
      });
      // ###### can reload the same route #######
      this.router.routeReuseStrategy.shouldReuseRoute = function () {
        return false;
      };
      this.mySubscription = this.router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.router.navigated = false;
        }
      });
      // ##########
      this.router.navigate(['/sites/details/', id_site]);
    }
  }
  addThemes(id_site, themes, sthemes, new_site) {
    // tslint:disable-next-line:prefer-const
    let tab_stheme = [];
    _.forEach(sthemes, (sub) => {
      tab_stheme.push(_.find(this.subthemes, { id_stheme: sub }));
    });
    // tslint:disable-next-line:prefer-const
    let stheme_theme = [];
    _.forEach(tab_stheme, (stheme) => {
      _.forEach(stheme.themes, (item) => {
        if (_.includes(themes, item)) {
          stheme_theme.push({
            id_site: id_site,
            id_theme: item,
            id_stheme: stheme.id_stheme,
          });
        }
      });
    });
    this.sitesService.addThemes({ data: stheme_theme }).subscribe(
      (response) => {
        this.addPhotos(id_site, new_site);
      },
      (err) => {
        this.spinner.hide();
        if (err.status === 403) {
          this.translate.get('ERRORS.SESSION_EXPIRED').subscribe((message: string) => {
            this.router.navigate(['']);
            this.toastr.error(message, '', {
              positionClass: 'toast-bottom-right',
            });
          });
        } else {
          this.translate.get('ERRORS.SERVER_ERROR').subscribe((message: string) => {
            this.toastr.error(message, '', {
              positionClass: 'toast-bottom-right',
            });
          });
        }
      }
    );
  }

  setAlert(message: string) {
    this.translate.get('ALERTS.ITEM_EXISTS').subscribe((translatedMessage: string) => {
      // Concaténer le message traduit avec la variable non traduite
      this.alert = {
        type: 'danger',
        message: `${translatedMessage.replace('{{ item }}', message)}`,
      };
    });
  }

  getSite(id_site) {
    this.sitesService.getsiteById(id_site).subscribe(
      (site) => {
        this.site = site.site[0];
        _.forEach(site.photos, (photo) => {
          this.initPhotos.push({
            id_photo: photo.id_photo,
            imgUrl: Conf.img_srv + '150x150/' + photo.path_file_photo,
            name: photo.path_file_photo,
          });
          this.photos.push({
            id_photo: photo.id_photo,
            imgUrl: Conf.img_srv + '150x150/' + photo.path_file_photo,
            name: photo.path_file_photo,
          });
        });
      },
      (err) => {
        this.translate.get('ERRORS.SERVER_ERROR').subscribe((res: string) => {
          this.toastr.error(res, '', {
            positionClass: 'toast-bottom-right',
          });
        });
      },
      () => {
        this.initMarker(this.site.geom[0], this.site.geom[1]);
        this.patchForm();
        this.loadForm = true;
        this.center = latLng(this.site.geom);
        this.siteForm.disable();
        this.themes_onChange();
        this.latlan_onChange();
      }
    );
  }

  themes_onChange() {
    this.siteForm.controls['id_theme'].statusChanges.subscribe(() => {
      this.selectedSubthemes = [];
      // this.siteForm.controls['id_stheme'].reset();
      if (
        this.siteForm.controls['id_theme'].value &&
        this.siteForm.controls['id_theme'].value.length !== 0
      ) {
        this.siteForm.controls['id_stheme'].enable();
        _.forEach(this.subthemes, (subtheme) => {
          _.forEach(this.siteForm.controls['id_theme'].value, (idTheme) => {
            if (
              _.includes(subtheme.themes, Number(idTheme)) &&
              !_.find(this.selectedSubthemes, { id_stheme: subtheme.id_stheme })
            ) {
              this.selectedSubthemes.push(subtheme);
            }
          });
        });
        _.map(this.siteForm.controls['id_stheme'].value, (idStheme) => {
          if (!_.find(this.selectedSubthemes, { id_stheme: idStheme })) {
            _.remove(this.siteForm.controls['id_stheme'].value, (item) => {
              return item === idStheme;
            });
          }
        });
        this.siteForm.patchValue({
          id_stheme: this.siteForm.controls['id_stheme'].value,
        });
      } else {
        this.siteForm.controls['id_stheme'].setValue(null),
          this.siteForm.controls['id_stheme'].disable();
        this.selectedSubthemes = [];
      }
    });
  }

  latlan_onChange() {
    this.siteForm.controls['lat'].statusChanges.subscribe(() => {
      if (
        this.siteForm.controls['lat'].valid &&
        this.siteForm.controls['lng'].valid &&
        this.markerCoordinates.length === 0
      ) {
        this.drawnItems.clearLayers();
        this.initMarker(
          this.siteForm.controls['lat'].value,
          this.siteForm.controls['lng'].value
        );
      } else if (
        this.siteForm.controls['lat'].invalid &&
        this.siteForm.controls['lng'].invalid
      ) {
        this.drawnItems.clearLayers();
        this.map.removeControl(this.drawControl);
        this.drawControl.setDrawingOptions({
          marker: {
            icon: this.icon,
          },
        });
        this.map.addControl(this.drawControl);
      }
    });
    this.siteForm.controls['lng'].statusChanges.subscribe(() => {
      if (
        this.siteForm.controls['lat'].valid &&
        this.siteForm.controls['lng'].valid &&
        this.markerCoordinates.length === 0
      ) {
        this.drawnItems.clearLayers();
        this.initMarker(
          this.siteForm.controls['lat'].value,
          this.siteForm.controls['lng'].value
        );
      } else if (
        this.siteForm.controls['lat'].invalid &&
        this.siteForm.controls['lng'].invalid
      ) {
        this.drawnItems.clearLayers();
        this.map.removeControl(this.drawControl);
        this.drawControl.setDrawingOptions({
          marker: {
            icon: this.icon,
          },
        });
        this.map.addControl(this.drawControl);
      }
    });
  }

  patchSite(siteJson, themes, sthemes) {
    siteJson.id_site = this.id_site;
    siteJson.main_theme_id = siteJson.main_theme_id || null;
    _.forEach(this.photos, (photo) => {
      if (_.has(photo, 'filePhoto')) {
        this.new_photos.push(photo);
      }
    });
    this.sitesService.updateSite(siteJson).pipe(
      switchMap((res) => {
        return this.translate.get(['INFO_MESSAGE.SUCCESS_UPDATED_SITE', 'BUTTONS.EDIT']).pipe(
          tap(translations => {
            this.toast_msg = translations['INFO_MESSAGE.SUCCESS_UPDATED_SITE'];
            this.edit_btn_text = translations['BUTTONS.EDIT'];
    
            if (this.deleted_photos.length > 0) {
              this.sitesService.deletePhotos(this.deleted_photos).subscribe();
            }
            this.addThemes(Number(this.id_site), themes, sthemes, false);
          })
        );
      })
    ).subscribe(
      () => {},  // Success handler (déjà géré dans `tap`)
      (err) => {
        this.spinner.hide();
        if (err.status === 403) {
          this.translate.get('ERRORS.SESSION_EXPIRED').subscribe((message: string) => {
            this.router.navigate(['']);
            this.toastr.error(message, '', {
              positionClass: 'toast-bottom-right',
            });
          });
        } else {
          this.translate.get('ERRORS.SERVER_ERROR').subscribe((message: string) => {
            this.toastr.error(message, '', {
              positionClass: 'toast-bottom-right',
            });
          });
        }
      }
    );
  }

  editForm() {
    this.edit_btn = !this.edit_btn;
    if (!this.edit_btn) {
      this.map.removeControl(this.drawControl);
      this.edit_btn_text = 'BUTTONS.EDIT';
      this.patchForm();
      this.alert = null;
      this.photos = this.initPhotos;
      this.siteForm.disable();
      this.initMarker(this.site.geom[0], this.site.geom[1]);
    } else {
      this.map.addControl(this.drawControl);
      this.edit_btn_text = 'BUTTONS.CANCEL';
      this.siteForm.enable();
    }
    this.siteForm.controls['id_stheme'].setValue(this.site.subthemes);
  }

  initMarker(lat, lan) {
    L.marker(latLng(lat, lan), { icon: this.icon }).addTo(this.drawnItems);
    this.center = latLng(lat, lan);
    this.map.removeControl(this.drawControl);
    this.drawControl.setDrawingOptions({
      marker: false,
    });
    this.map.addControl(this.drawControl);
    if (this.id_site && !this.edit_btn) {
      this.map.removeControl(this.drawControl);
    }
  }

  openDeleteModal(content) {
    this.modalRef = this.modalService.open(content, {
      windowClass: 'delete-modal',
      centered: true,
    });
  }

  cancelDelete() {
    this.modalRef.close();
  }

  deletePhoto(photo) {
    _.remove(this.photos, (item) => {
      return item === photo;
    });
    _.remove(this.new_photos, (item) => {
      return item === photo;
    });
    photo.imgUrl = photo.imgUrl.replace(Conf.img_srv, '');
    this.deleted_photos.push(photo);
  }

  // TODO: Traduire les messages liés aux toasts
  deleteSite() {
    this.sitesService.deleteSite(this.id_site).subscribe(
      (res) => {
        this.router.navigate(['sites']);
      },
      (err) => {
        if (err.status === 403) {
          this.translate.get('ERRORS.SESSION_EXPIRED').subscribe((message: string) => {
            this.router.navigate(['']);
            this.toastr.error(message, '', {
              positionClass: 'toast-bottom-right',
            });
          });
        } else {
          this.translate.get('ERRORS.SERVER_ERROR').subscribe((message: string) => {
            this.toastr.error(message, '', {
              positionClass: 'toast-bottom-right',
            });
          });
        }
      }
    );
    this.modalRef.close();
  }

  onCancel() {
    this.siteForm.reset();
    this.router.navigate(['sites']);
  }

  patchForm() {
    this.siteForm.patchValue({
      name_site: this.site.name_site,
      desc_site: this.site.desc_site,
      ref_site: this.site.ref_site,
      testim_site: this.site.testim_site,
      publish_site: this.site.publish_site,
      lng: this.site.geom[1].toFixed(6),
      lat: this.site.geom[0].toFixed(6),
      id_theme: this.site.themes,
      id_stheme: this.site.subthemes,
      code_city_site: this.site.code_city_site,
      main_theme_id: this.site.main_theme_id,
      legend_site: this.site.legend_site,
      id_observatory: this.site.id_observatory,
    });
    if (this.site.path_file_guide_site) {
      this.noticeName = this.site.path_file_guide_site;
    }
  }
  layerUrl(key, layer) {
    return (
      'http://wxs.ign.fr/' +
      key +
      '/geoportail/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&' +
      'LAYER=' +
      layer +
      '&STYLE=normal&TILEMATRIXSET=PM&' +
      'TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg'
    );
  }

  ngOnDestroy() {
    this.spinner.hide();
    if (this.mySubscription) {
      this.mySubscription.unsubscribe();
    }
  }
}
