import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';

// Kendi Firebase projenizden aldığınız yapılandırma bilgilerini buraya yapıştırın.
// Bu bilgiler, Firebase konsolunuzda projenizi oluşturduktan sonra web uygulamanızı kaydettiğinizde size verilenlerdir.
const firebaseConfig = {
  apiKey: "AIzaSyAyyhHamyj95DOTZrwyjc3_S7NXprQ-UW0",
  authDomain: "film-uygulamam-firebase.firebaseapp.com",
  projectId: "film-uygulamam-firebase",
  storageBucket: "film-uygulamam-firebase.firebasestorage.app",
  messagingSenderId: "332639007789",
  appId: "1:332639007789:web:83c051116e550eb680f4a4",
  measurementId: "G-Q2103SV5QG"
};

// Bu, uygulamanızın veritabanı yolunda kullanılacak benzersiz bir kimliktir.
// Kendi isteğinize göre 'my-personal-film-app' gibi bir değer verebilirsiniz.
// Bu değeri değiştirdikten sonra bir daha değiştirmemeye çalışın ki verileriniz aynı yolda kalsın.
const APP_UNIQUE_ID = 'film-critic-app-v1'; // Burayı isteğe göre değiştirebilirsiniz!

// TMDb API Anahtarınızı buraya yapıştırın.
// Kendi anahtarınızı https://www.themoviedb.org/documentation/api adresinden almalısınız.
const TMDB_API_KEY = '8a8f64bbeacb4b9f4ab5581b9a4ea068'; // Anahtarınız buraya doğru girilmiş.

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [films, setFilms] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // Hata düzeltildi: selectedFilm useState ile doğru başlatıldı
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [userRating, setUserRating] = useState(0);
  const [userReview, setUserReview] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error'

  // Firebase başlatma ve kimlik doğrulama
  useEffect(() => {
    // Firebase uygulamasını başlat
    const app = initializeApp(firebaseConfig); // firebaseConfig yukarıda tanımlı
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setDb(firestoreDb);
    setAuth(firebaseAuth);

    // Kimlik doğrulama durumu değişikliğini dinle
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setUserId(user.uid); // Zaten oturum açmış bir kullanıcı varsa UID'sini al
      } else {
        // Oturum açılmamışsa, anonim olarak oturum açmayı dene
        try {
          await signInAnonymously(firebaseAuth); // Sadece anonim giriş kullanıyoruz
          setUserId(firebaseAuth.currentUser?.uid); // Anonim giriş yapıldığında UID'yi al
        } catch (error) {
          console.error("Firebase kimlik doğrulama hatası:", error);
          setMessage({ text: 'Uygulamaya bağlanırken bir hata oluştu.', type: 'error' });
        }
      }
      setIsAuthReady(true); // Kimlik doğrulama hazır
    });

    return () => unsubscribe(); // Listener'ı temizle
  }, []); // Bağımlılık dizisi boş bırakıldı, sadece bir kez çalışır

  // Filmleri Firestore'dan çekme
  useEffect(() => {
    if (!db || !isAuthReady || !userId) {
      return; // DB veya Auth hazır değilse işlem yapma
    }

    setLoading(true);
    // Firestore koleksiyon yolu: /artifacts/{APP_UNIQUE_ID}/users/{userId}/films
    // APP_UNIQUE_ID kullanılarak veri yolu düzeltildi
    const userFilmsCollectionRef = collection(db, `artifacts/${APP_UNIQUE_ID}/users/${userId}/films`);

    // onSnapshot ile gerçek zamanlı güncellemeleri dinle
    const unsubscribe = onSnapshot(userFilmsCollectionRef, (snapshot) => {
      const fetchedFilms = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Films dizisini son eklenen filmin en üstte olması için sırala
      setFilms(fetchedFilms.sort((a, b) => (b.addedAt?.toDate() || 0) - (a.addedAt?.toDate() || 0)));
      setLoading(false);
    }, (error) => {
      console.error("Filmler çekilirken hata oluştu:", error);
      setMessage({ text: 'Filmleri yüklerken bir hata oluştu.', type: 'error' });
      setLoading(false);
    });

    return () => unsubscribe(); // Listener'ı temizle
  }, [db, isAuthReady, userId]); // Bağımlılıklar güncellendi

  // TMDb'den film arama
  const searchMovies = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(searchTerm)}`
      );
      if (!response.ok) {
        throw new Error(`HTTP hatası! Durum: ${response.status}`);
      }
      const data = await response.json();
      setSearchResults(data.results.slice(0, 5)); // İlk 5 sonucu göster
    } catch (error) {
      console.error("Film arama hatası:", error);
      setMessage({ text: 'Film ararken bir sorun oluştu. API anahtarınız doğru mu?', type: 'error' });
    } finally {
      setSearchLoading(false);
    }
  };

  // Seçilen filmi Firestore'a ekle veya güncelle
  const addOrUpdateFilm = async () => {
    if (!selectedFilm || !db || !userId) {
      setMessage({ text: 'Lütfen bir film seçin ve puan/yorum girin.', type: 'error' });
      return;
    }

    if (userRating === 0) {
      setMessage({ text: 'Lütfen filme puan verin.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      // APP_UNIQUE_ID kullanılarak veri yolu düzeltildi
      const filmDocRef = doc(db, `artifacts/${APP_UNIQUE_ID}/users/${userId}/films`, String(selectedFilm.id));

      // Belirli bir filmin zaten mevcut olup olmadığını kontrol et
      const docSnap = await getDoc(filmDocRef);

      if (docSnap.exists()) {
        // Film zaten varsa güncelle
        await updateDoc(filmDocRef, {
          rating: userRating,
          review: userReview,
          updatedAt: serverTimestamp(), // Güncelleme zamanını kaydet
        });
        setMessage({ text: `${selectedFilm.title} başarıyla güncellendi!`, type: 'success' });
      } else {
        // Film yoksa ekle
        await setDoc(filmDocRef, {
          tmdb_id: selectedFilm.id,
          title: selectedFilm.title,
          poster_path: selectedFilm.poster_path,
          release_date: selectedFilm.release_date,
          rating: userRating,
          review: userReview,
          addedAt: serverTimestamp(), // Ekleme zamanını kaydet
        });
        setMessage({ text: `${selectedFilm.title} başarıyla eklendi!`, type: 'success' });
      }

      // Alanları temizle
      setSelectedFilm(null);
      setSearchTerm('');
      setSearchResults([]);
      setUserRating(0);
      setUserReview('');

    } catch (error) {
      console.error("Filmi kaydederken hata oluştu:", error);
      setMessage({ text: 'Filmi kaydederken bir hata oluştu.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Film silme
  const deleteFilm = async (filmId, filmTitle) => {
    if (!db || !userId) return;

    // Gerçek uygulamada custom modal kullanın, şimdilik window.confirm kullanılıyor
    if (window.confirm(`${filmTitle} filmini silmek istediğinizden emin misiniz?`)) {
      setLoading(true);
      try {
        // APP_UNIQUE_ID kullanılarak veri yolu düzeltildi
        await deleteDoc(doc(db, `artifacts/${APP_UNIQUE_ID}/users/${userId}/films`, filmId));
        setMessage({ text: `${filmTitle} başarıyla silindi.`, type: 'success' });
      } catch (error) {
        console.error("Filmi silerken hata oluştu:", error);
        setMessage({ text: 'Filmi silerken bir hata oluştu.', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
  };

  // Puanlama yıldız bileşeni
  const RatingStars = ({ rating, setRating, editable = false }) => {
    return (
      <div className="flex items-center space-x-1">
        {[...Array(5)].map((_, index) => {
          const starValue = index + 1;
          return (
            <svg
              key={starValue}
              className={`w-6 h-6 ${starValue <= rating ? 'text-yellow-400' : 'text-gray-300'} ${editable ? 'cursor-pointer' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
              onClick={() => editable && setRating(starValue)}
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.96a1 1 0 00.95.69h4.164c.969 0 1.371 1.24.588 1.81l-3.375 2.45c-.3.218-.48.601-.18 1.522l1.286 3.96c.3.921-.755 1.688-1.54 1.118l-3.375-2.45c-.3-.218-.48-.601-.18-1.522l1.286-3.96c.3-.921-.755-1.688-1.54-1.118l-3.375 2.45c-.3.218-.48-.601-.18-1.522l1.286-3.96c.3-.921-.755-1.688-1.54-1.118l-3.375 2.45c-.3.218-.48-.601-.18-1.522l1.286-3.96c.3-.921-.755-1.688-1.54-1.118l-3.375-2.45c-.3.218-.48-.601-.18-1.522l1.286-3.96c.3-.921-.755-1.688-1.54-1.118z" />
            </svg>
          );
        })}
      </div>
    );
  };

  // Mesaj gösterimi (success/error)
  const renderMessage = () => {
    if (!message.text) return null;
    return (
      <div className={`p-3 rounded-md mb-4 text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {message.text}
      </div>
    );
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <p className="text-lg text-gray-700">Uygulama yükleniyor ve kimlik doğrulanıyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-inter p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 text-center">Film Eleştiri ve Puanlama Uygulaması</h1>
      <p className="text-md sm:text-lg text-gray-600 mb-8 text-center max-w-2xl">
        Kendi izlediğiniz filmleri puanlayın ve eleştirilerinizi yazın. Verileriniz size özel olarak kaydedilecektir.
      </p>

      {renderMessage()}

      {/* Kullanıcı ID'si gösterimi */}
      <div className="text-sm text-gray-500 mb-4 bg-gray-50 p-2 rounded-md shadow-sm border border-gray-200">
        Kullanıcı ID'niz: <span className="font-mono text-gray-700 break-all">{userId || 'Yükleniyor...'}</span>
      </div>

      {/* Film Arama ve Ekleme Alanı */}
      <div className="w-full max-w-3xl bg-white p-6 rounded-xl shadow-lg mb-8 border border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Film Ekle / Güncelle</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <input
            type="text"
            className="flex-grow p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition duration-200 shadow-sm"
            placeholder="Film adı ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchMovies(); }}
          />
          <button
            onClick={searchMovies}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center shadow-md"
            disabled={searchLoading}
          >
            {searchLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Ara'
            )}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="bg-gray-50 p-4 rounded-md border border-gray-200 max-h-60 overflow-y-auto mb-4">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Arama Sonuçları:</h3>
            <ul className="space-y-2">
              {searchResults.map((film) => (
                <li
                  key={film.id}
                  className={`flex items-center p-2 rounded-md cursor-pointer hover:bg-blue-100 transition duration-150 ${selectedFilm?.id === film.id ? 'bg-blue-200' : ''}`}
                  onClick={() => {
                    setSelectedFilm(film);
                    setUserRating(0); // Yeni film seçildiğinde puanı sıfırla
                    setUserReview(''); // Yeni film seçildiğinde yorumu sıfırla
                  }}
                >
                  <img
                    src={film.poster_path ? `https://image.tmdb.org/t/p/w92${film.poster_path}` : 'https://placehold.co/92x138/CCCCCC/FFFFFF?text=Poster Yok'}
                    alt={film.title}
                    className="w-12 h-18 rounded-sm mr-3 shadow-sm"
                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/92x138/CCCCCC/FFFFFF?text=Poster Yok'; }}
                  />
                  <div className="flex-grow">
                    <p className="font-semibold text-gray-900">{film.title}</p>
                    {film.release_date && <p className="text-sm text-gray-600">({new Date(film.release_date).getFullYear()})</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedFilm && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-xl font-semibold text-blue-800 mb-3">Seçilen Film: {selectedFilm.title}</h3>
            <div className="flex items-center mb-3">
              <span className="text-lg font-medium text-blue-700 mr-2">Puanınız:</span>
              <RatingStars rating={userRating} setRating={setUserRating} editable={true} />
            </div>
            <textarea
              className="w-full p-3 border border-blue-300 rounded-md mb-4 focus:ring-blue-500 focus:border-blue-500 transition duration-200 shadow-sm"
              rows="4"
              placeholder={`${selectedFilm.title} hakkındaki eleştirinizi buraya yazın...`}
              value={userReview}
              onChange={(e) => setUserReview(e.target.value)}
            ></textarea>
            <button
              onClick={addOrUpdateFilm}
              className="w-full px-6 py-3 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md"
              disabled={loading}
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                'Filmi Kaydet / Güncelle'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Eklenmiş Filmler Listesi */}
      <div className="w-full max-w-5xl bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Eklenmiş Filmleriniz</h2>
        {loading && films.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <svg className="animate-spin h-8 w-8 text-blue-500 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg text-gray-700">Filmler yükleniyor...</p>
          </div>
        ) : films.length === 0 ? (
          <p className="text-center text-gray-500 p-8">Henüz hiç film eklemediniz. Yukarıdaki arama kutusunu kullanarak başlayın!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {films.map((film) => (
              <div key={film.id} className="bg-gray-50 p-4 rounded-lg shadow-md border border-gray-200 flex flex-col">
                <div className="flex items-start mb-3">
                  <img
                    src={film.poster_path ? `https://image.tmdb.org/t/p/w185${film.poster_path}` : 'https://placehold.co/185x278/CCCCCC/FFFFFF?text=Poster Yok'}
                    alt={film.title}
                    className="w-24 h-36 rounded-md mr-4 shadow-sm"
                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/185x278/CCCCCC/FFFFFF?text=Poster Yok'; }}
                  />
                  <div className="flex-grow">
                    <h3 className="text-xl font-semibold text-gray-900">{film.title}</h3>
                    {film.release_date && <p className="text-sm text-gray-600 mb-1">({new Date(film.release_date).getFullYear()})</p>}
                    <div className="flex items-center mb-2">
                      <span className="text-base font-medium text-gray-700 mr-1">Puanınız:</span>
                      <RatingStars rating={film.rating} />
                    </div>
                  </div>
                </div>
                <p className="text-gray-700 text-sm italic mb-4 flex-grow">{film.review || 'Henüz eleştiri yok.'}</p>
                <div className="flex justify-end space-x-2 mt-auto">
                  <button
                    onClick={() => {
                      setSelectedFilm({ id: film.tmdb_id, title: film.title, poster_path: film.poster_path, release_date: film.release_date });
                      setUserRating(film.rating);
                      setUserReview(film.review);
                      setSearchTerm(film.title); // Arama kutusunu güncelleyelim
                      setSearchResults([]); // Arama sonuçlarını temizleyelim
                      window.scrollTo({ top: 0, behavior: 'smooth' }); // En üste kaydır
                    }}
                    className="px-4 py-2 bg-yellow-500 text-white text-sm font-medium rounded-md hover:bg-yellow-600 transition duration-200 shadow-sm"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => deleteFilm(film.id, film.title)}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition duration-200 shadow-sm"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
