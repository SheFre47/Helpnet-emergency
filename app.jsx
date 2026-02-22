// HelpNet - Global Disaster Response App
// Main React Component - Mobile Optimized

const { useState, useEffect, useRef, useCallback } = React;

// Mapbox Token (Your Public Token)
const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2hlZnJlNDciLCJahIjoiY21seTN2bTBwMHR3dTNkcXoxZnR0YXAzYSJ9.Udp8137hXtupQQkG49mD7w';

// Skills database for AI matching
const SKILL_CATEGORIES = {
  medical: ['doctor', 'nurse', 'paramedic', 'first aid', 'emt'],
  rescue: ['search and rescue', 'firefighter', 'diver', 'climber'],
  logistics: ['driver', 'pilot', 'translator', 'cook', 'organizer'],
  technical: ['engineer', 'builder', 'electrician', 'plumber', 'it']
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('map'); // 'map', 'request', 'profile', 'dashboard'
  const [requests, setRequests] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Initialize Firebase Auth
  useEffect(() => {
    const { onAuthStateChanged } = window.authFns;
    const auth = window.firebaseAuth;
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        getUserLocation();
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Get GPS location
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(loc);
          console.log('📍 Location:', loc);
        },
        (error) => {
          console.error('Location error:', error);
          // Default to London if denied
          setUserLocation({ lat: 51.5074, lng: -0.1278 });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!userLocation || mapInstanceRef.current) return;
    
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [userLocation.lng, userLocation.lat],
      zoom: 12,
      attributionControl: false
    });
    
    mapInstanceRef.current = map;
    
    // Add user location marker
    new mapboxgl.Marker({ color: '#3742fa' })
      .setLngLat([userLocation.lng, userLocation.lat])
      .setPopup(new mapboxgl.Popup().setHTML('<b>You are here</b>'))
      .addTo(map);
    
    // Load existing requests
    loadRequests();
    
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [userLocation]);

  // Real-time Firestore listener for help requests
  const loadRequests = () => {
    const { collection, query, orderBy, onSnapshot } = window.firestoreFns;
    const db = window.firebaseDb;
    
    const q = query(
      collection(db, 'requests'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = [];
      snapshot.forEach((doc) => {
        reqs.push({ id: doc.id, ...doc.data() });
      });
      setRequests(reqs);
      updateMapMarkers(reqs);
    });
    
    return unsubscribe;
  };

  // Update map markers when requests change
  const updateMapMarkers = (reqs) => {
    if (!mapInstanceRef.current) return;
    
    // Clear old markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    
    reqs.forEach((req) => {
      if (!req.location) return;
      
      const color = req.urgency === 'high' ? '#ff4757' : 
                    req.urgency === 'medium' ? '#ffa502' : '#2ed573';
      
      const el = document.createElement('div');
      el.className = 'w-4 h-4 rounded-full cursor-pointer pulse-marker';
      el.style.backgroundColor = color;
      el.style.boxShadow = `0 0 0 4px ${color}40`;
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat([req.location.lng, req.location.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div class="p-2 max-w-xs">
                <h3 class="font-bold text-red-600">${req.type}</h3>
                <p class="text-sm text-gray-600">${req.description?.substring(0, 50)}...</p>
                <p class="text-xs text-gray-400 mt-1">Urgency: ${req.urgency}</p>
              </div>
            `)
        )
        .addTo(mapInstanceRef.current);
      
      el.addEventListener('click', () => setSelectedRequest(req));
      markersRef.current.push(marker);
    });
  };

  // Google Sign In
  const handleLogin = async () => {
    try {
      const { signInWithPopup } = window.authFns;
      const auth = window.firebaseAuth;
      const provider = window.firebaseProvider;
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed: ' + error.message);
    }
  };

  // Logout
  const handleLogout = async () => {
    const { signOut } = window.authFns;
    const auth = window.firebaseAuth;
    await signOut(auth);
    setView('map');
  };

  // AI Skill Matching Algorithm
  const calculateMatchScore = (volunteerSkills, requestNeeds) => {
    if (!volunteerSkills || !requestNeeds) return 0;
    
    const volunteerSkillsLower = volunteerSkills.map(s => s.toLowerCase());
    const needsLower = requestNeeds.map(n => n.toLowerCase());
    
    let matches = 0;
    needsLower.forEach(need => {
      if (volunteerSkillsLower.some(skill => skill.includes(need) || need.includes(skill))) {
        matches++;
      }
    });
    
    return Math.round((matches / needsLower.length) * 100);
  };

  // Submit help request
  const submitRequest = async (formData) => {
    const { collection, addDoc, serverTimestamp, GeoPoint } = window.firestoreFns;
    const db = window.firebaseDb;
    
    try {
      await addDoc(collection(db, 'requests'), {
        ...formData,
        location: new GeoPoint(formData.location.lat, formData.location.lng),
        createdAt: serverTimestamp(),
        status: 'open',
        requesterId: user?.uid || 'anonymous',
        requesterName: user?.displayName || 'Anonymous'
      });
      
      alert('Help request sent! Volunteers have been notified.');
      setView('map');
    } catch (error) {
      console.error('Error submitting:', error);
      alert('Failed to send request. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading HelpNet...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-red-600 text-white p-4 shadow-lg z-50">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            🆘 HelpNet
          </h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setView('map')}
              className={`p-2 rounded ${view === 'map' ? 'bg-red-700' : ''}`}
            >
              🗺️
            </button>
            <button 
              onClick={() => setView('request')}
              className={`p-2 rounded ${view === 'request' ? 'bg-red-700' : ''}`}
            >
              ➕
            </button>
            <button 
              onClick={() => setView('dashboard')}
              className={`p-2 rounded ${view === 'dashboard' ? 'bg-red-700' : ''}`}
            >
              👤
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        {view === 'map' && (
          <MapView 
            mapRef={mapRef} 
            requests={requests}
            userLocation={userLocation}
            selectedRequest={selectedRequest}
            setSelectedRequest={setSelectedRequest}
          />
        )}
        
        {view === 'request' && (
          <RequestForm 
            userLocation={userLocation}
            onSubmit={submitRequest}
            user={user}
          />
        )}
        
        {view === 'dashboard' && (
          <Dashboard 
            user={user}
            requests={requests}
            onLogout={handleLogout}
            calculateMatchScore={calculateMatchScore}
          />
        )}
      </main>
    </div>
  );
};

// Login Screen Component
const LoginScreen = ({ onLogin }) => (
  <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center p-4">
    <div className="glass-panel p-8 w-full max-w-sm text-center">
      <div className="text-6xl mb-4">🆘</div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">HelpNet</h1>
      <p className="text-gray-600 mb-8">Global Disaster Response & Volunteer Coordination</p>
      
      <div className="space-y-4">
        <button 
          onClick={onLogin}
          className="w-full bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg shadow hover:bg-gray-50 transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
      
      <p className="mt-6 text-xs text-gray-500">
        Secure, fast access. We never post without permission.
      </p>
    </div>
  </div>
);

// Map View Component
const MapView = ({ mapRef, requests, selectedRequest, setSelectedRequest }) => (
  <div className="relative h-full">
    <div ref={mapRef} className="absolute inset-0" />
    
    {/* Request Counter */}
    <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-10">
      <p className="text-sm font-semibold text-gray-700">
        🔴 {requests.filter(r => r.urgency === 'high').length} Critical
      </p>
      <p className="text-sm font-semibold text-gray-700">
        🟡 {requests.filter(r => r.urgency === 'medium').length} Moderate
      </p>
      <p className="text-sm font-semibold text-gray-700">
        🟢 {requests.filter(r => r.urgency === 'low').length} Low
      </p>
    </div>
    
    {/* Selected Request Detail */}
    {selectedRequest && (
      <div className="absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-xl p-4 z-10 max-h-64 overflow-y-auto">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg text-red-600">{selectedRequest.type}</h3>
          <button 
            onClick={() => setSelectedRequest(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <p className="text-gray-700 mb-2">{selectedRequest.description}</p>
        <div className="flex gap-2 mb-2">
          <span className={`px-2 py-1 rounded text-xs font-semibold ${
            selectedRequest.urgency === 'high' ? 'bg-red-100 text-red-700' :
            selectedRequest.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
            {selectedRequest.urgency.toUpperCase()}
          </span>
          <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
            {selectedRequest.status}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Posted by: {selectedRequest.requesterName}
        </p>
        <button className="mt-3 w-full bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700">
          I Can Help →
        </button>
      </div>
    )}
  </div>
);

// Request Form Component
const RequestForm = ({ userLocation, onSubmit, user }) => {
  const [formData, setFormData] = useState({
    type: '',
    description: '',
    urgency: 'medium',
    needs: [],
    location: userLocation
  });
  const [customNeed, setCustomNeed] = useState('');

  const requestTypes = [
    'Medical Emergency', 'Trapped/Rescue', 'Food/Water', 'Shelter',
    'Evacuation', 'Search Missing', 'Supplies', 'Other'
  ];

  const commonNeeds = [
    'doctor', 'nurse', 'driver', 'translator', 'heavy lifting',
    'boat', 'helicopter', 'climbing gear', 'generator', 'first aid'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.type || !formData.description) {
      alert('Please fill in all required fields');
      return;
    }
    onSubmit(formData);
  };

  const toggleNeed = (need) => {
    setFormData(prev => ({
      ...prev,
      needs: prev.needs.includes(need) 
        ? prev.needs.filter(n => n !== need)
        : [...prev.needs, need]
    }));
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Request Help</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
        {/* Request Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Emergency Type *
          </label>
          <select 
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            required
          >
            <option value="">Select type...</option>
            {requestTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Urgency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Urgency Level *
          </label>
          <div className="flex gap-2">
            {['low', 'medium', 'high'].map(level => (
              <button
                key={level}
                type="button"
                onClick={() => setFormData({...formData, urgency: level})}
                className={`flex-1 py-2 rounded-lg font-semibold capitalize ${
                  formData.urgency === level
                    ? level === 'high' ? 'bg-red-600 text-white' :
                      level === 'medium' ? 'bg-yellow-500 text-white' :
                      'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            placeholder="Describe the situation, number of people, specific needs..."
            className="w-full p-3 border border-gray-300 rounded-lg h-32 focus:ring-2 focus:ring-red-500"
            required
          />
        </div>

        {/* Skills/Resources Needed (AI Matching) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Skills/Resources Needed (for AI matching)
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {commonNeeds.map(need => (
              <button
                key={need}
                type="button"
                onClick={() => toggleNeed(need)}
                className={`px-3 py-1 rounded-full text-sm ${
                  formData.needs.includes(need)
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {need}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customNeed}
              onChange={(e) => setCustomNeed(e.target.value)}
              placeholder="Add custom need..."
              className="flex-1 p-2 border border-gray-300 rounded-lg"
            />
            <button
              type="button"
              onClick={() => {
                if (customNeed.trim()) {
                  toggleNeed(customNeed.trim());
                  setCustomNeed('');
                }
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg"
            >
              Add
            </button>
          </div>
        </div>

        {/* Location Confirmation */}
        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-sm text-blue-800">
            📍 Location: {formData.location ? 
              `${formData.location.lat.toFixed(4)}, ${formData.location.lng.toFixed(4)}` : 
              'Detecting...'}
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-red-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-red-700 shadow-lg"
        >
          🚨 Send Emergency Request
        </button>
      </form>
    </div>
  );
};

// Dashboard Component
const Dashboard = ({ user, requests, onLogout, calculateMatchScore }) => {
  const [userSkills, setUserSkills] = useState([]);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile', 'matches', 'my-requests'

  // Find matching requests based on user skills
  const matchedRequests = requests.filter(req => {
    if (!req.needs || req.needs.length === 0) return false;
    const score = calculateMatchScore(userSkills, req.needs);
    return score > 30; // 30% match threshold
  }).map(req => ({
    ...req,
    matchScore: calculateMatchScore(userSkills, req.needs)
  })).sort((a, b) => b.matchScore - a.matchScore);

  const myRequests = requests.filter(r => r.requesterId === user?.uid);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        {/* User Header */}
        <div className="bg-white rounded-lg shadow p-4 mb-4 text-center">
          <img 
            src={user?.photoURL || 'https://via.placeholder.com/100'} 
            alt="Profile" 
            className="w-20 h-20 rounded-full mx-auto mb-2 border-4 border-red-100"
          />
          <h2 className="text-xl font-bold">{user?.displayName}</h2>
          <p className="text-gray-500 text-sm">{user?.email}</p>
          <button 
            onClick={onLogout}
            className="mt-3 text-red-600 text-sm font-semibold"
          >
            Sign Out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-lg shadow mb-4 overflow-hidden">
          {['profile', 'matches', 'my-requests'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold capitalize ${
                activeTab === tab ? 'bg-red-600 text-white' : 'text-gray-600'
              }`}
            >
              {tab === 'my-requests' ? 'My Requests' : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-lg mb-3">My Skills (for AI Matching)</h3>
            <p className="text-sm text-gray-600 mb-3">
              Add your skills to get matched with relevant help requests.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.values(SKILL_CATEGORIES).flat().map(skill => (
                <button
                  key={skill}
                  onClick={() => setUserSkills(prev => 
                    prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
                  )}
                  className={`px-3 py-1 rounded-full text-sm capitalize ${
                    userSkills.includes(skill)
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                💡 Tip: Select skills like "doctor", "driver", or "translator" to receive relevant alerts.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'matches' && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">AI-Matched Requests ({matchedRequests.length})</h3>
            {matchedRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No matching requests nearby. Add more skills or check back later.
              </p>
            ) : (
              matchedRequests.map(req => (
                <div key={req.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold">{req.type}</h4>
                    <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">
                      {req.matchScore}% Match
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{req.description?.substring(0, 80)}...</p>
                  <div className="flex gap-2 text-xs">
                    <span className="text-gray-500">Needs: {req.needs?.join(', ')}</span>
                  </div>
                  <button className="mt-2 w-full bg-green-600 text-white py-2 rounded text-sm font-semibold">
                    Respond to Help
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'my-requests' && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">My Requests ({myRequests.length})</h3>
            {myRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                You haven't created any requests yet.
              </p>
            ) : (
              myRequests.map(req => (
                <div key={req.id} className={`bg-white rounded-lg shadow p-4 urgency-${req.urgency}`}>
                  <h4 className="font-bold">{req.type}</h4>
                  <p className="text-sm text-gray-600">{req.description?.substring(0, 60)}...</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                      req.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {req.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {req.createdAt?.toDate?.().toLocaleDateString() || 'Just now'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Mount React
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

