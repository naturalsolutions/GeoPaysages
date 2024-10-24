import { Component, OnInit, ViewChild } from '@angular/core';
import { ObservatoriesService } from '../services/observatories.service';
import { Router, ActivatedRoute } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { FormGroup } from '@angular/forms';
import { FormService } from '../services/form.service';
import { Conf } from './../config';
import * as _ from 'lodash';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../services/auth.service';
import { NgxSpinnerService } from 'ngx-spinner';
import { ObservatoryPatchType, ObservatoryType } from '../types';
import * as io from 'jsts/org/locationtech/jts/io';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest, Observable } from 'rxjs';

@Component({
  selector: 'app-observatory',
  templateUrl: './observatory.component.html',
  styleUrls: ['./observatory.component.scss'],
})
export class ObservatoryComponent implements OnInit {
  @ViewChild('thumbnailInput') thumbnailInput;
  @ViewChild('logoInput') logoInput;

  selectedThumb: File;
  selectedLogo: File;
  selectedFile: File[];
  modalRef: NgbModalRef;
  selectedSubthemes = [];
  thumbs = [];
  noticeName: any;
  new_notice: any;
  observatoryForm: FormGroup;
  observatoryJson;
  themes: any;
  subthemes: any;
  loadForm = false;
  mySubscription;
  id_observatory = null;
  photoBaseUrl = Conf.img_srv;
  previewImage: string | ArrayBuffer;
  alert: { type: string; message: string };
  observatory: ObservatoryType;
  isEditing = false;
  edit_btn_text = 'BUTTONS.EDIT';
  submit_btn_text = 'BUTTONS.ADD';
  initThumbs: any[] = [];
  deleted_thumbs = [];
  new_thumbs = [];
  toast_msg: string;
  communes: undefined;
  currentUser: any;
  removed_notice: any = null;
  constructor(
    private observatoryService: ObservatoriesService,
    public formService: FormService,
    protected router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private modalService: NgbModal,
    private authService: AuthService,
    private spinner: NgxSpinnerService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.currentUser;
    this.id_observatory = this.route.snapshot.params['id'];
    this.observatoryForm = this.formService.initFormObservatory();
    if (this.id_observatory) {
      this.getObservatory(this.id_observatory);
      this.submit_btn_text = 'BUTTONS.ADD';
    } else {
      this.isEditing = true;
      this.loadForm = true;
    }
  }

  onThumbChange(event) {
    if (event.target && event.target.files.length > 0) {
      this.selectedThumb = event.target.files[0];
    }
  }

  onThumbCancel(input) {
    input.value = '';
    this.selectedThumb = null;
  }

  onLogoChange(event) {
    if (event.target && event.target.files.length > 0) {
      this.selectedLogo = event.target.files[0];
    }
  }

  onLogoCancel(input) {
    input.value = '';
    this.selectedLogo = null;
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
    this.observatoryForm.controls['notice'].reset();
    this.selectedFile = null;
  }

  async submitObservatory(observatoryForm) {
    this.alert = null;
    if (!observatoryForm.valid) {
      return;
    }
    if (observatoryForm.value.geom) {
      const reader = new io.WKTReader();
      try {
        const geom = reader.read(observatoryForm.value.geom);
        if (geom.getGeometryType() !== 'MultiPolygon') {
          this.getTranslatedMessages([
            'INFO_MESSAGE.GEOM_SHOULD_BE_MULTIPOLYGON',
            'ERRORS.INVALID_GEOM',
          ]).subscribe(([errorMessage, title]) => {
            this.toastr.error(errorMessage, title, {
              positionClass: 'toast-bottom-right',
            });
          });
          return;
        }
      } catch (error) {
        this.translate
          .get('ERRORS.INVALID_GEOM')
          .subscribe((message: string) => {
            this.toastr.error(error, message, {
              positionClass: 'toast-bottom-right',
            });
          })
       
        return;
      }
    }
    this.isEditing = false;
    this.spinner.show();
    try {
      if (!this.id_observatory) {
        const res = await this.postObservatory();
        await this.patchImages(res.id);
        console.log('res', res);

        this.router.navigate(['observatories', 'details', res.id]);
        return;
      } else {
        await this.patchObservatory();
        await this.patchImages(this.observatory.id);
      }
    } catch (err) {
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
    this.edit_btn_text = 'BUTTONS.EDIT';
    this.spinner.hide();
  }

  setAlert(message: string) {
    this.translate.get('ALERTS.ITEM_EXISTS').subscribe((translatedMessage: string) => {
      this.alert = {
        type: 'danger',
        message: `${translatedMessage.replace('{{ item }}', message)}`,
      };
    });
  }
  getObservatory(id_observatory) {
    this.observatoryService.getById(id_observatory).subscribe(
      (observatory) => {
        this.observatory = observatory;
      },
      (err) => {
        console.log('err', err);
        this.translate.get('ERRORS.SERVER_ERROR').subscribe((message: string) => {
          this.toastr.error(message, '', {
            positionClass: 'toast-bottom-right',
          });
        })
      },
      () => {
        this.patchForm();
        this.loadForm = true;
        this.observatoryForm.disable();
      }
    );
  }

  postObservatory(): Promise<ObservatoryType> {
    return new Promise((resolve, reject) => {
      this.observatoryService.post(this.observatoryForm.value).subscribe(
        (res) => {
          this.translate.get("INFO_MESSAGE.SUCCESS_ADDED_OBSERVATORY").subscribe((message: string) => {
            this.toastr.success(message, '', {
              positionClass: 'toast-bottom-right',
            })
          resolve(res);
          });
        },
        (err) => {
          reject(err);
        }
      );
    });
  }

  patchObservatory(): Promise<void> {
    return new Promise((resolve, reject) => {
      const patch: ObservatoryPatchType = _.omit(
        this.observatoryForm.value,
        'id'
      );
      this.observatoryService.patch(this.id_observatory, patch).subscribe(
        (res) => {
          this.toastr.success('Observatoire mis à jour', '', {
            positionClass: 'toast-bottom-right',
          });
          resolve();
        },
        (err) => {
          reject(err);
        }
      );
    });
  }

  async patchImages(id: number) {
    if (this.selectedThumb) {
      const data: FormData = new FormData();
      data.append('field', 'thumbnail');
      data.append('image', this.selectedThumb);
      const res = await this.observatoryService.patchImage(id, data);
      if (this.observatory) {
        this.observatory.thumbnail = res.filename;
      }
      this.selectedThumb = null;
    }
    if (this.selectedLogo) {
      const data: FormData = new FormData();
      data.append('field', 'logo');
      data.append('image', this.selectedLogo);
      const res = await this.observatoryService.patchImage(id, data);
      if (this.observatory) {
        this.observatory.logo = res.filename;
      }
      this.selectedLogo = null;
    }
  }

  editForm() {
    this.isEditing = !this.isEditing;
    if (!this.isEditing) {
      this.edit_btn_text = 'BUTTONS.EDIT';
      this.patchForm();
      this.alert = null;
      this.observatoryForm.disable();
      this.selectedThumb = null;
      this.thumbnailInput.nativeElement.value = '';
      this.selectedLogo = null;
      this.logoInput.nativeElement.value = '';
    } else {
      this.edit_btn_text = 'BUTTONS.CANCEL';
      this.observatoryForm.enable();
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

  deleteThumbnail(thumbnail) {
    _.remove(this.thumbs, (item) => {
      return item === thumbnail;
    });
    _.remove(this.new_thumbs, (item) => {
      return item === thumbnail;
    });
    thumbnail.imgUrl = thumbnail.imgUrl.replace(Conf.img_srv, '');
    this.deleted_thumbs.push(thumbnail);
  }

  deleteObservatory() {
    /* this.observatorysService.deleteObservatory(this.id_observatory).subscribe(
      (res) => {
        this.router.navigate(['observatorys']);
      },
      (err) => {
        if (err.status === 403) {
          this.router.navigate(['']);
          this.toastr.error('votre session est expirée', '', {
            positionClass: 'toast-bottom-right',
          });
        } else
          this.toastr.error('Une erreur est survenue sur le serveur.', '', {
            positionClass: 'toast-bottom-right',
          });
      }
    );
    this.modalRef.close(); */
  }

  onCancel() {
    this.observatoryForm.reset();
    this.router.navigate(['observatories']);
  }

  patchForm() {
    this.observatoryForm.patchValue(this.observatory);
  }

  ngOnDestroy() {
    this.spinner.hide();
    if (this.mySubscription) {
      this.mySubscription.unsubscribe();
    }
  }

  getTranslatedMessages(keys: string[]): Observable<string[]> {
    return combineLatest(keys.map(key => this.translate.get(key)));
  }
}
