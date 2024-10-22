import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AppConstants } from '../constants/app.constants'; // AppConstants from '../constants/app.constants';
import { TranslateService } from '@ngx-translate/core';
@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private defaultLanguage = AppConstants.DEFAULT_LANGUAGES;
  private languages = AppConstants.LANGUAGES;
  private languageFiles = AppConstants.LANGUAGE_FILES;

  constructor(private http: HttpClient, private translate: TranslateService) {
    this.setDefaultLanguage();
  }

  // Vérifie si le fichier de langue existe
  checkLanguageExists(language: string): Observable<boolean> {
    const filePath = this.languageFiles[language];
    return this.http.get(filePath).pipe(
      map(() => true),
      catchError(() => of(false)) // Si le fichier n'existe pas, retourne false
    );
  }

  // Récupère les langues disponibles
  getAvailableLanguages(): Observable<string[]> {
    const checks = this.languages.map(lang => this.checkLanguageExists(lang));
    return new Observable<string[]>(observer => {
      const results: string[] = [];
      let completedRequests = 0;

      checks.forEach((check, index) => {
        check.subscribe(exists => {
          if (exists) {
            results.push(this.languages[index]);
          }
          completedRequests++;
          if (completedRequests === checks.length) {
            observer.next(results);
            observer.complete();
          }
        });
      });
    });
  }


 getCurrentLang(): string {
    return this.translate.currentLang
 }
 // Récupère la langue préférée de l'utilisateur depuis le localStorage
 private getPreferredLanguage(): string {
    return localStorage.getItem('preferredLanguage') || this.defaultLanguage; // 'fr' par défaut
  }

private setDefaultLanguage(): void {
    console.log("Setting default language...");
    // Définir la langue par défaut
    this.translate.setDefaultLang(this.defaultLanguage);

    // Obtenir la langue du navigateur
    const browserLang = navigator.language.split('-')[0]; // Extrait 'fr' de 'fr-FR'
    console.log(`Browser language: ${browserLang}`);
    // Récupérer la langue préférée de l'utilisateur
    const preferredLang = this.getPreferredLanguage();

    // Vérifier si la langue du navigateur ou la langue préférée est supportée
    if (this.languages.includes(preferredLang)) {
      this.translate.use(preferredLang); // Utiliser la langue préférée
      console.log(`Using preferred language: ${preferredLang}`);
    } else if (this.languages.includes(browserLang)) {
      this.translate.use(browserLang); // Utiliser la langue du navigateur
      console.log(`Using browser language: ${browserLang}`);
    } else {
      this.translate.use(this.defaultLanguage); // Utiliser la langue par défaut si pas supportée
      console.log(`Using default language: ${this.defaultLanguage}`)
    }
  }

  // Change la langue et la stocke dans le localStorage
  changeLanguage(language: string): void {
    if (this.languages.includes(language)) {
      this.translate.use(language);
      localStorage.setItem('preferredLanguage', language); // Stocke la langue dans localStorage
    }
  }
}
