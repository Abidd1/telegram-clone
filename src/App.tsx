import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Search, MoreVertical, Paperclip, Smile, Video, Phone, PhoneOff, Mic, MicOff, VideoOff, Flag, Ban, Check, CheckCheck, Settings, ArrowLeft, Trash2, Volume2, VolumeX, Users, FlipHorizontal, MapPin, Globe, Calendar, Info, Moon, Sun, X } from 'lucide-react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type User = {
  id: string;
  username: string;
  avatar: string;
  bio?: string;
  location?: string;
  website?: string;
  joined_at?: string;
  last_seen: string;
};

type Chat = {
  id: string;
  name: string;
  is_group: boolean;
  last_message?: string;
  last_message_time?: string;
  avatar?: string;
  is_online?: boolean;
  other_user_id?: string;
  unread_count?: number;
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  file_url?: string;
  created_at: string;
  status: 'sent' | 'read';
  username: string;
  avatar: string;
  reactions?: { emoji: string; user_id: string }[];
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dark_mode');
    return saved ? JSON.parse(saved) : false;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  
  const [typingUsers, setTypingUsers] = useState<Record<string, Record<string, string>>>({});
  const typingTimeoutsRef = useRef<Record<string, Record<string, NodeJS.Timeout>>>({});
  const lastTypingSentRef = useRef<number>(0);
  
  // WebRTC State
  const [incomingCall, setIncomingCall] = useState<{ chatId: string, senderId: string, senderName: string, senderAvatar: string, offer: any, callType: 'audio' | 'video' | 'video-only' } | null>(null);
  const incomingCallRef = useRef<{ chatId: string, senderId: string, senderName: string, senderAvatar: string, offer: any, callType: 'audio' | 'video' | 'video-only' } | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle');
  const callStatusRef = useRef<'idle' | 'calling' | 'receiving' | 'connected'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [isLocalVideoFlipped, setIsLocalVideoFlipped] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | 'video-only'>('video');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentCallChatIdRef = useRef<string | null>(null);

  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const blockedUsersRef = useRef<string[]>([]);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportType, setReportType] = useState('Spam');
  const [showReportSuccess, setShowReportSuccess] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  const [currentView, setCurrentView] = useState<'chat' | 'profile'>('chat');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editWebsite, setEditWebsite] = useState('');

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contacts, setContacts] = useState<{id: string, username: string, avatar: string}[]>([]);

  const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{id: string, username: string, avatar: string}[]>([]);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAvatar, setEditGroupAvatar] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);

  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('dark_mode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    // Check for authenticated session
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then(user => {
        setCurrentUser(user);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (activeChat && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mark_read',
        chatId: activeChat.id
      }));
    }
  }, [activeChat, messages]); // Also trigger when new messages arrive in the active chat

  useEffect(() => {
    if (!currentUser) return;

    // Fetch chats
    fetch(`/api/chats/${currentUser.id}`)
      .then(res => res.json())
      .then(data => setChats(data));

    // Fetch blocked users
    fetch(`/api/blocks/${currentUser.id}`)
      .then(res => res.json())
      .then(data => {
        setBlockedUsers(data);
        blockedUsersRef.current = data;
      });

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?userId=${currentUser.id}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('Connected to WebSocket');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message') {
        const msg = data.message;
        
        // If the sender is blocked, ignore the message completely
        if (blockedUsersRef.current.includes(msg.sender_id)) {
          return;
        }

        setMessages(prev => {
          // Prevent duplicates
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        
        // Update chat list last message and unread count
        setChats(prev => prev.map(c => {
          if (c.id === msg.chat_id) {
            const isFromOthers = msg.sender_id !== currentUser?.id;
            const isNotInActiveChat = activeChat?.id !== msg.chat_id;
            return { 
              ...c, 
              last_message: msg.content, 
              last_message_time: msg.created_at,
              unread_count: (c.unread_count || 0) + (isFromOthers && isNotInActiveChat ? 1 : 0)
            };
          }
          return c;
        }).sort((a, b) => {
          const timeA = new Date(a.last_message_time || 0).getTime();
          const timeB = new Date(b.last_message_time || 0).getTime();
          return timeB - timeA;
        }));
      } else if (data.type === 'user_status') {
        setChats(prev => prev.map(c => {
          if (c.other_user_id === data.userId) {
            return { ...c, is_online: data.status === 'online' };
          }
          return c;
        }));

        if (data.status === 'offline') {
          setTypingUsers(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(chatId => {
              if (next[chatId][data.userId]) {
                const chatTyping = { ...next[chatId] };
                delete chatTyping[data.userId];
                next[chatId] = chatTyping;
              }
            });
            return next;
          });
        }
      } else if (data.type === 'reaction_updated') {
        setMessages(prev => prev.map(m => {
          if (m.id === data.messageId) {
            const currentReactions = m.reactions || [];
            let newReactions = [...currentReactions];
            if (data.action === 'added') {
              newReactions.push({ emoji: data.emoji, user_id: data.userId });
            } else {
              newReactions = newReactions.filter(r => !(r.emoji === data.emoji && r.user_id === data.userId));
            }
            return { ...m, reactions: newReactions };
          }
          return m;
        }));
      } else if (data.type === 'typing') {
        const { chatId, userId, username, isTyping } = data;
        
        setTypingUsers(prev => {
          const chatTyping = { ...(prev[chatId] || {}) };
          if (isTyping) {
            chatTyping[userId] = username;
          } else {
            delete chatTyping[userId];
          }
          return { ...prev, [chatId]: chatTyping };
        });

        // Clear existing timeout
        if (typingTimeoutsRef.current[chatId]?.[userId]) {
          clearTimeout(typingTimeoutsRef.current[chatId][userId]);
        }

        if (isTyping) {
          if (!typingTimeoutsRef.current[chatId]) typingTimeoutsRef.current[chatId] = {};
          typingTimeoutsRef.current[chatId][userId] = setTimeout(() => {
            setTypingUsers(prev => {
              const chatTyping = { ...(prev[chatId] || {}) };
              delete chatTyping[userId];
              return { ...prev, [chatId]: chatTyping };
            });
          }, 3000);
        }
      } else if (data.type === 'call_signal') {
        const { chatId, senderId, senderName, senderAvatar, signal } = data;
        
        if (signal.type === 'offer') {
          if (callStatusRef.current !== 'idle') {
            wsRef.current?.send(JSON.stringify({
              type: 'call_signal',
              chatId,
              targetUserId: senderId,
              signal: { type: 'busy' }
            }));
            return;
          }
          const callData = { chatId, senderId, senderName, senderAvatar, offer: signal.offer, callType: signal.callType };
          setIncomingCall(callData);
          incomingCallRef.current = callData;
          setCallType(signal.callType);
          setCallStatus('receiving');
          callStatusRef.current = 'receiving';
        } else if (signal.type === 'answer') {
          if (peerConnectionRef.current && currentCallChatIdRef.current === chatId) {
            peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.answer));
            setCallStatus('connected');
            callStatusRef.current = 'connected';
          }
        } else if (signal.type === 'ice') {
          if (peerConnectionRef.current && currentCallChatIdRef.current === chatId) {
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } else if (signal.type === 'reject' || signal.type === 'busy' || signal.type === 'end') {
          if (currentCallChatIdRef.current === chatId || incomingCallRef.current?.chatId === chatId) {
            cleanupCall();
            if (signal.type === 'busy') alert('User is busy on another call.');
            if (signal.type === 'reject') alert('Call was rejected.');
          }
        }
      } else if (data.type === 'error') {
        alert(data.message);
      } else if (data.type === 'messages_read') {
        setMessages(prev => prev.map(m => 
          (m.chat_id === data.chatId && m.sender_id === currentUser.id) 
            ? { ...m, status: 'read' } 
            : m
        ));
        // If we read messages, clear the unread count for that chat
        if (data.readBy === currentUser?.id) {
          setChats(prev => prev.map(c => 
            c.id === data.chatId ? { ...c, unread_count: 0 } : c
          ));
        }
      } else if (data.type === 'profile_updated') {
        const { userId, username, avatar, bio, location, website } = data;
        setChats(prev => prev.map(c => {
          if (c.other_user_id === userId) {
            return { ...c, name: username, avatar, bio, location, website };
          }
          return c;
        }));
        setMessages(prev => prev.map(m => {
          if (m.sender_id === userId) {
            return { ...m, username, avatar };
          }
          return m;
        }));
        if (currentUser?.id === userId) {
          const updated = { ...currentUser, username, avatar, bio, location, website };
          setCurrentUser(updated);
          localStorage.setItem('chat_user', JSON.stringify(updated));
        }
      } else if (data.type === 'message_deleted') {
        setMessages(prev => prev.filter(m => m.id !== data.messageId));
        // Update chat list last message if it was the last message
        setChats(prev => prev.map(c => {
          if (c.id === data.chatId) {
            // We don't have the previous message easily available here without fetching,
            // so we just clear it or leave it. For simplicity, we'll leave it or clear if it matches.
            // A better approach would be to fetch the new last message, but we'll just clear it if it matches.
            // Actually, let's just leave it as is or clear it if it's the same.
            return c;
          }
          return c;
        }));
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [currentUser]);

  useEffect(() => {
    if (activeChat && currentUser) {
      fetch(`/api/messages/${activeChat.id}?userId=${currentUser.id}`)
        .then(res => res.json())
        .then(data => setMessages(data));
    }
  }, [activeChat, currentUser]);

  useEffect(() => {
    if (activeChat && messages.length > 0 && currentUser) {
      const unreadMessages = messages.filter(m => m.sender_id !== currentUser.id && m.status !== 'read');
      if (unreadMessages.length > 0) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'mark_read',
            chatId: activeChat.id
          }));
          
          setMessages(prev => prev.map(m => 
            (m.chat_id === activeChat.id && m.sender_id !== currentUser.id) 
              ? { ...m, status: 'read' } 
              : m
          ));
        }
      }
    }
  }, [activeChat, messages, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) return;

    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
      } else {
        setAuthError(data.error || 'Login failed');
      }
    } catch (err) {
      setAuthError('Network error. Please try again.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) return;

    setAuthError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
      } else {
        setAuthError(data.error || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Network error. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      setActiveChat(null);
      setMessages([]);
      setChats([]);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !currentUser) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('Upload failed');
      
      const data = await res.json();
      const fileType = file.type.startsWith('image/') ? 'image' : 'file';
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'send_message',
          chatId: activeChat.id,
          content: fileType === 'image' ? 'Sent an image' : `Sent a file: ${file.name}`,
          messageType: fileType,
          fileUrl: data.url
        }));
      }
    } catch (err) {
      console.error('File upload error:', err);
      alert('Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeChat || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      type: 'send_message',
      chatId: activeChat.id,
      content: messageInput
    }));

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      chatId: activeChat.id,
      isTyping: false
    }));

    setMessageInput('');
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    if (!activeChat || !wsRef.current) return;
    
    if (e.target.value.trim() === '') {
      wsRef.current.send(JSON.stringify({
        type: 'typing',
        chatId: activeChat.id,
        isTyping: false
      }));
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      wsRef.current.send(JSON.stringify({
        type: 'typing',
        chatId: activeChat.id,
        isTyping: true
      }));
      lastTypingSentRef.current = now;
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: 'toggle_reaction',
      messageId,
      emoji
    }));
  };

  const currentActiveChat = activeChat ? (chats.find(c => c.id === activeChat.id) || activeChat) : null;

  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleBlockUser = async (userIdToBlock: string) => {
    try {
      if (blockedUsers.includes(userIdToBlock)) {
        await fetch('/api/blocks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser!.id, blockedUserId: userIdToBlock })
        });
        const newBlocked = blockedUsers.filter(id => id !== userIdToBlock);
        setBlockedUsers(newBlocked);
        blockedUsersRef.current = newBlocked;
      } else {
        await fetch('/api/blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser!.id, blockedUserId: userIdToBlock })
        });
        const newBlocked = [...blockedUsers, userIdToBlock];
        setBlockedUsers(newBlocked);
        blockedUsersRef.current = newBlocked;
      }
      setShowChatMenu(false);
      
      // Refetch chats and messages to update UI
      fetch(`/api/chats/${currentUser!.id}`)
        .then(res => res.json())
        .then(data => setChats(data));
        
      if (activeChat) {
        fetch(`/api/messages/${activeChat.id}?userId=${currentUser!.id}`)
          .then(res => res.json())
          .then(data => setMessages(data));
      }
    } catch (e) {
      console.error('Failed to toggle block', e);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingMessageId || !currentUser) return;

    setIsReporting(true);
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: currentUser.id,
          messageId: reportingMessageId,
          reason: reportType === 'Other' ? reportReason : reportType
        })
      });
      setReportingMessageId(null);
      setReportReason('');
      setReportType('Spam');
      setShowReportSuccess(true);
      setTimeout(() => setShowReportSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to report message', e);
    } finally {
      setIsReporting(false);
    }
  };

  const confirmDeleteMessage = () => {
    if (!deletingMessageId || !currentActiveChat || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'delete_message',
      messageId: deletingMessageId,
      chatId: currentActiveChat.id
    }));
    
    setDeletingMessageId(null);
  };

  const toggleRemoteMute = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
      setIsRemoteMuted(remoteVideoRef.current.muted);
    }
  };

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallStatus('idle');
    callStatusRef.current = 'idle';
    setIncomingCall(null);
    incomingCallRef.current = null;
    currentCallChatIdRef.current = null;
    setIsMuted(false);
    setIsVideoOff(false);
    setIsRemoteMuted(false);
  };

  const startCall = async (chatId: string, targetUserId?: string, type: 'audio' | 'video' | 'video-only' = 'video') => {
    try {
      setCallType(type);
      const isVideo = type === 'video' || type === 'video-only';
      const isAudio = type === 'audio' || type === 'video';
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: isAudio });
      localStreamRef.current = stream;
      if (localVideoRef.current && isVideo) localVideoRef.current.srcObject = stream;
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;
      currentCallChatIdRef.current = chatId;
      setCallStatus('calling');
      callStatusRef.current = 'calling';

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'call_signal',
            chatId,
            targetUserId,
            signal: { type: 'ice', candidate: event.candidate }
          }));
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'call_signal',
          chatId,
          targetUserId,
          signal: { type: 'offer', offer, callType: type }
        }));
      }
    } catch (err) {
      console.error('Error starting call:', err);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!incomingCallRef.current) return;
    const callData = incomingCallRef.current;
    try {
      setCallType(callData.callType);
      const isVideo = callData.callType === 'video' || callData.callType === 'video-only';
      const isAudio = callData.callType === 'audio' || callData.callType === 'video';
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: isAudio });
      localStreamRef.current = stream;
      if (localVideoRef.current && isVideo) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;
      currentCallChatIdRef.current = callData.chatId;
      setCallStatus('connected');
      callStatusRef.current = 'connected';

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'call_signal',
            chatId: callData.chatId,
            targetUserId: callData.senderId,
            signal: { type: 'ice', candidate: event.candidate }
          }));
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'call_signal',
          chatId: callData.chatId,
          targetUserId: callData.senderId,
          signal: { type: 'answer', answer }
        }));
      }
      setIncomingCall(null);
      incomingCallRef.current = null;
    } catch (err) {
      console.error('Error accepting call:', err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (incomingCallRef.current && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'call_signal',
        chatId: incomingCallRef.current.chatId,
        targetUserId: incomingCallRef.current.senderId,
        signal: { type: 'reject' }
      }));
    }
    cleanupCall();
  };

  const endCall = () => {
    if (currentCallChatIdRef.current && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'call_signal',
        chatId: currentCallChatIdRef.current,
        signal: { type: 'end' }
      }));
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMutedState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMutedState;
      });
      setIsMuted(newMutedState);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const newVideoOffState = !isVideoOff;
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !newVideoOffState;
      });
      setIsVideoOff(newVideoOffState);
    }
  };

  const openProfile = () => {
    setEditUsername(currentUser!.username);
    setEditAvatar(currentUser!.avatar);
    setEditBio(currentUser!.bio || '');
    setEditLocation(currentUser!.location || '');
    setEditWebsite(currentUser!.website || '');
    setCurrentView('profile');
  };

  const openCreateGroup = () => {
    fetch(`/api/users?excludeId=${currentUser!.id}`)
      .then(res => res.json())
      .then(data => {
        setContacts(data);
        setShowCreateGroup(true);
        setGroupName('');
        setGroupAvatar('');
        setSelectedContacts([]);
      });
  };

  const toggleContactSelection = (id: string) => {
    setSelectedContacts(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedContacts.length === 0 || !currentUser) return;

    try {
      await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          avatar: groupAvatar,
          memberIds: selectedContacts,
          creatorId: currentUser.id
        })
      });
      
      setShowCreateGroup(false);
      
      // Refetch chats
      fetch(`/api/chats/${currentUser.id}`)
        .then(res => res.json())
        .then(data => setChats(data));
    } catch (e) {
      console.error('Failed to create group', e);
    }
  };

  const openGroupSettings = () => {
    if (!currentActiveChat || !currentActiveChat.is_group) return;
    setEditGroupName(currentActiveChat.name);
    setEditGroupAvatar(currentActiveChat.avatar || '');
    fetch(`/api/groups/${currentActiveChat.id}/members`)
      .then(res => res.json())
      .then(data => {
        setGroupMembers(data);
        setShowGroupSettings(true);
      });
  };

  const saveGroupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentActiveChat || !editGroupName.trim()) return;

    try {
      await fetch(`/api/groups/${currentActiveChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editGroupName, avatar: editGroupAvatar })
      });
      
      setChats(prev => prev.map(c => 
        c.id === currentActiveChat.id 
          ? { ...c, name: editGroupName, avatar: editGroupAvatar }
          : c
      ));
      setActiveChat(prev => prev ? { ...prev, name: editGroupName, avatar: editGroupAvatar } : null);
      setShowGroupSettings(false);
    } catch (e) {
      console.error('Failed to update group', e);
    }
  };

  const removeGroupMember = async (memberId: string) => {
    if (!currentActiveChat) return;
    try {
      await fetch(`/api/groups/${currentActiveChat.id}/members/${memberId}`, {
        method: 'DELETE'
      });
      setGroupMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (e) {
      console.error('Failed to remove member', e);
    }
  };

  const openAddMembers = () => {
    fetch(`/api/users?excludeId=${currentUser!.id}`)
      .then(res => res.json())
      .then(data => {
        const existingMemberIds = groupMembers.map(m => m.id);
        const availableContacts = data.filter((c: any) => !existingMemberIds.includes(c.id));
        setContacts(availableContacts);
        setSelectedContacts([]);
        setShowAddMembers(true);
      });
  };

  const addMembersToGroup = async () => {
    if (!currentActiveChat || selectedContacts.length === 0) return;
    try {
      await fetch(`/api/groups/${currentActiveChat.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedContacts })
      });
      
      fetch(`/api/groups/${currentActiveChat.id}/members`)
        .then(res => res.json())
        .then(data => {
          setGroupMembers(data);
          setShowAddMembers(false);
        });
    } catch (e) {
      console.error('Failed to add members', e);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-slate-900 dark:text-slate-100 rounded-sm px-0.5">{part}</mark> 
        : part
    );
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: editUsername, 
          avatar: editAvatar,
          bio: editBio,
          location: editLocation,
          website: editWebsite
        })
      });
      if (res.ok) {
        const updatedUser = { 
          ...currentUser, 
          username: editUsername, 
          avatar: editAvatar,
          bio: editBio,
          location: editLocation,
          website: editWebsite
        };
        setCurrentUser(updatedUser);
        localStorage.setItem('chat_user', JSON.stringify(updatedUser));
        setCurrentView('chat');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update profile');
      }
    } catch (err) {
      console.error('Failed to update profile', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center transition-colors duration-300">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300 relative">
        <div className="absolute top-6 right-6">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-3 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-800 transition-all hover:scale-110"
            title={isDarkMode ? "Light Mode" : "Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 transition-all">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-indigo-500 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/20 rotate-12">
              <Send className="w-10 h-10 text-white ml-1 -rotate-12" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
            {isRegistering ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-8 font-medium">
            {isRegistering ? 'Join our secure messaging platform' : 'Login to your secure account'}
          </p>
          
          {authError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm rounded-2xl text-center font-medium animate-in fade-in slide-in-from-top-2">
              {authError}
            </div>
          )}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Username</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                placeholder="Enter your username"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 ml-1">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-500 text-white font-bold py-4 rounded-2xl hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
            >
              {isRegistering ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError('');
              }}
              className="text-indigo-500 dark:text-indigo-400 font-bold hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
            >
              {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">
      {/* Sidebar */}
      <div className="w-80 md:w-96 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 relative">
        {currentView === 'profile' ? (
          <div className="absolute inset-0 bg-white dark:bg-slate-900 z-20 flex flex-col">
            <div className="h-16 px-4 flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <button 
                onClick={() => setCurrentView('chat')}
                className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-lg">Profile</h2>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={saveProfile} className="space-y-6">
                <div className="flex flex-col items-center">
                  <div className="relative w-32 h-32 mb-4">
                    <img src={editAvatar} alt="Avatar Preview" className="w-32 h-32 rounded-full bg-slate-200 dark:bg-slate-800 object-cover shadow-md" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Avatar URL</label>
                  <input
                    type="url"
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://example.com/avatar.png"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Username"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24"
                    placeholder="Tell us about yourself..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Location
                    </label>
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="City, Country"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Website
                    </label>
                    <input
                      type="url"
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="https://yourwebsite.com"
                    />
                  </div>
                </div>
                {currentUser.joined_at && (
                  <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm py-2">
                    <Calendar className="w-4 h-4" />
                    <span>Joined {format(new Date(currentUser.joined_at), 'MMMM yyyy')}</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors shadow-sm"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
                >
                  Log Out
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {/* Sidebar Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button onClick={openProfile} className="relative group focus:outline-none">
              <img src={currentUser.avatar} alt="avatar" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:opacity-80 transition-opacity" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 rounded-full transition-opacity">
                <Settings className="w-5 h-5 text-white" />
              </div>
            </button>
            <span className="font-semibold text-slate-800 dark:text-slate-100">{currentUser.username}</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title={isDarkMode ? "Light Mode" : "Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={openCreateGroup}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Create Group"
            >
              <Users className="w-5 h-5" />
            </button>
            <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
              No chats found
            </div>
          ) : (
            filteredChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => {
                  if (activeChat && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'typing',
                      chatId: activeChat.id,
                      isTyping: false
                    }));
                  }
                  setActiveChat(chat);
                  setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c));
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-50 dark:border-slate-800/50",
                  activeChat?.id === chat.id ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                )}
              >
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!chat.is_group) {
                      setSelectedUserProfile({
                        id: chat.other_user_id!,
                        username: chat.name,
                        avatar: chat.avatar!,
                        bio: chat.bio,
                        location: chat.location,
                        website: chat.website,
                        joined_at: chat.joined_at,
                        last_seen: ''
                      });
                    }
                  }}
                  className="relative w-12 h-12 flex-shrink-0 group focus:outline-none"
                  disabled={chat.is_group}
                >
                  {chat.avatar ? (
                    <img src={chat.avatar} alt={chat.name} className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:opacity-80 transition-opacity" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/60 transition-colors">
                      {chat.name.charAt(0)}
                    </div>
                  )}
                  {!chat.is_group && (
                    <div className={cn(
                      "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900",
                      chat.is_online ? "bg-green-500" : "bg-slate-300 dark:bg-slate-700"
                    )} />
                  )}
                </button>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{chat.name}</h3>
                  {chat.last_message_time && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      {(() => {
                        const date = new Date(chat.last_message_time);
                        const today = new Date();
                        const yesterday = new Date();
                        yesterday.setDate(today.getDate() - 1);
                        
                        if (date.toDateString() === today.toDateString()) {
                          return format(date, 'HH:mm');
                        } else if (date.toDateString() === yesterday.toDateString()) {
                          return 'Yesterday';
                        } else if (date.getFullYear() === today.getFullYear()) {
                          return format(date, 'MMM d');
                        } else {
                          return format(date, 'MM/dd/yy');
                        }
                      })()}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <p className={cn(
                    "text-sm truncate flex-1",
                    typingUsers[chat.id] && Object.keys(typingUsers[chat.id]).length > 0 ? "text-indigo-500 dark:text-indigo-400 font-medium italic" : "text-slate-500 dark:text-slate-400"
                  )}>
                    {typingUsers[chat.id] && Object.keys(typingUsers[chat.id]).length > 0 
                      ? `${Object.values(typingUsers[chat.id])[0]}${Object.keys(typingUsers[chat.id]).length > 1 ? ' and others' : ''} is typing...`
                      : (chat.last_message || 'No messages yet')
                    }
                  </p>
                  {chat.unread_count && chat.unread_count > 0 && chat.id !== activeChat?.id && (
                    <div className="ml-2 bg-indigo-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                      {chat.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#e4e3e0] dark:bg-slate-950 relative transition-colors duration-300">
        {/* Chat Background Pattern (Subtle) */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}></div>

        {currentActiveChat ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between z-10 shadow-sm">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => !currentActiveChat.is_group && setSelectedUserProfile({
                    id: currentActiveChat.other_user_id!,
                    username: currentActiveChat.name,
                    avatar: currentActiveChat.avatar!,
                    bio: currentActiveChat.bio,
                    location: currentActiveChat.location,
                    website: currentActiveChat.website,
                    joined_at: currentActiveChat.joined_at,
                    last_seen: ''
                  })}
                  className="relative w-10 h-10 flex-shrink-0 group focus:outline-none"
                  disabled={currentActiveChat.is_group}
                >
                  {currentActiveChat.avatar ? (
                    <img src={currentActiveChat.avatar} alt={currentActiveChat.name} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:opacity-80 transition-opacity" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/60 transition-colors">
                      {currentActiveChat.name.charAt(0)}
                    </div>
                  )}
                  {!currentActiveChat.is_group && (
                    <div className={cn(
                      "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900",
                      currentActiveChat.is_online ? "bg-green-500" : "bg-slate-300 dark:bg-slate-700"
                    )} />
                  )}
                </button>
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100">{currentActiveChat.name}</h2>
                  <p className={cn(
                    "text-xs",
                    !currentActiveChat.is_group && currentActiveChat.is_online ? "text-green-500" : "text-slate-500 dark:text-slate-400"
                  )}>
                    {currentActiveChat.is_group ? 'Group Chat' : (currentActiveChat.is_online ? 'Online' : 'Offline')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                {!currentActiveChat.is_group && (
                  <>
                    <button 
                      onClick={() => startCall(currentActiveChat.id, currentActiveChat.other_user_id, 'audio')}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                      title="Audio Call"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => startCall(currentActiveChat.id, currentActiveChat.other_user_id, 'video')}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                      title="Video Call"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => startCall(currentActiveChat.id, currentActiveChat.other_user_id, 'video-only')}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                      title="Video Only Call"
                    >
                      <div className="relative">
                        <Video className="w-5 h-5" />
                        <MicOff className="w-3 h-3 absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 rounded-full text-red-500" />
                      </div>
                    </button>
                  </>
                )}
                <button 
                  onClick={() => {
                    setShowChatSearch(!showChatSearch);
                    if (showChatSearch) setChatSearchQuery('');
                  }}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    showChatSearch ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                  title="Search Messages"
                >
                  <Search className="w-5 h-5" />
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {showChatMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 py-1 z-50">
                      {currentActiveChat.is_group ? (
                        <button 
                          onClick={() => {
                            setShowChatMenu(false);
                            openGroupSettings();
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                        >
                          <Settings className="w-4 h-4" />
                          Group Settings
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            setShowChatMenu(false);
                            toggleBlockUser(currentActiveChat.other_user_id!);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                        >
                          <Ban className="w-4 h-4" />
                          {blockedUsers.includes(currentActiveChat.other_user_id!) ? 'Unblock User' : 'Block User'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Chat Search Bar */}
            {showChatSearch && (
              <div className="px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10 animate-in slide-in-from-top duration-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder="Search in conversation..."
                    className="w-full pl-10 pr-10 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                  {chatSearchQuery && (
                    <button 
                      onClick={() => setChatSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 z-10 space-y-4">
              {messages.filter(msg => 
                !blockedUsers.includes(msg.sender_id) && 
                (!chatSearchQuery || msg.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
              ).length === 0 && chatSearchQuery && (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 opacity-60">
                  <Search className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-xl font-bold">No results found</p>
                  <p className="text-sm">Try searching for something else</p>
                </div>
              )}

              {messages.filter(msg => 
                !blockedUsers.includes(msg.sender_id) && 
                (!chatSearchQuery || msg.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
              ).map((msg, idx, filteredMessages) => {
                const isMe = msg.sender_id === currentUser.id;
                const showAvatar = !isMe && (idx === 0 || filteredMessages[idx - 1].sender_id !== msg.sender_id);
                
                // Date separator logic
                const currentDate = new Date(msg.created_at);
                const prevDate = idx > 0 ? new Date(filteredMessages[idx - 1].created_at) : null;
                const showDateSeparator = !prevDate || currentDate.toDateString() !== prevDate.toDateString();
                
                let dateLabel = format(currentDate, 'MMMM d, yyyy');
                const today = new Date();
                const yesterday = new Date();
                yesterday.setDate(today.getDate() - 1);
                
                if (currentDate.toDateString() === today.toDateString()) {
                  dateLabel = 'Today';
                } else if (currentDate.toDateString() === yesterday.toDateString()) {
                  dateLabel = 'Yesterday';
                }

                // Group reactions by emoji
                const reactionCounts: Record<string, { count: number, me: boolean }> = {};
                (msg.reactions || []).forEach(r => {
                  if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, me: false };
                  reactionCounts[r.emoji].count++;
                  if (r.user_id === currentUser.id) reactionCounts[r.emoji].me = true;
                });
                
                return (
                  <React.Fragment key={msg.id}>
                    {showDateSeparator && (
                      <div className="flex justify-center my-6">
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold rounded-full uppercase tracking-wider shadow-sm">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                    <div className={cn("flex max-w-[75%] mb-1", isMe ? "ml-auto justify-end" : "mr-auto")}>
                    {!isMe && (
                      <div className="w-8 flex-shrink-0 mr-2">
                        {showAvatar && <img src={msg.avatar} alt={msg.username} className="w-8 h-8 rounded-full shadow-sm" />}
                      </div>
                    )}
                    <div className="flex flex-col relative group">
                        {/* Reaction Picker (Click) */}
                        {activeReactionMessageId === msg.id && (
                          <div className={cn(
                            "absolute -top-12 bg-white dark:bg-slate-800 shadow-lg rounded-full px-3 py-2 flex gap-2 z-30 border border-slate-100 dark:border-slate-700",
                            isMe ? "right-0" : "left-0"
                          )}>
                            {['👍', '❤️', '😂', '😮', '😢'].map(emoji => (
                              <button
                                key={emoji}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleReaction(msg.id, emoji);
                                  setActiveReactionMessageId(null);
                                }}
                                className="hover:scale-125 transition-transform text-xl"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        <div 
                          className={cn(
                            "rounded-2xl px-4 py-2 shadow-sm relative cursor-pointer transition-colors duration-200",
                            isMe ? "bg-indigo-500 text-white rounded-tr-sm" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-sm"
                          )}
                          onClick={() => setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id)}
                        >
                          {!isMe && showAvatar && (
                            <div className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mb-1">{msg.username}</div>
                          )}
                          
                          {msg.type === 'image' && msg.file_url ? (
                            <div className="mb-2">
                              <img 
                                src={msg.file_url} 
                                alt="Shared image" 
                                className="rounded-lg max-w-full max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(msg.file_url, '_blank')}
                              />
                            </div>
                          ) : msg.type === 'file' && msg.file_url ? (
                            <div className="mb-2">
                              <a 
                                href={msg.file_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group/file"
                              >
                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-indigo-500">
                                  <Paperclip className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate pr-2">
                                    {msg.content.replace('Sent a file: ', '')}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Click to download</p>
                                </div>
                              </a>
                            </div>
                          ) : (
                            <div className="text-[15px] leading-relaxed break-words">{highlightText(msg.content, chatSearchQuery)}</div>
                          )}
                          
                          <div className={cn(
                            "text-[11px] mt-1 flex items-center gap-1",
                            isMe ? "text-indigo-100 justify-end" : "text-slate-400 dark:text-slate-500 justify-start"
                          )} title={format(new Date(msg.created_at), 'PPPP p')}>
                            <span>{format(new Date(msg.created_at), 'HH:mm')}</span>
                            {isMe && (
                              msg.status === 'read' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-300 dark:text-blue-400" />
                              ) : (
                                <Check className="w-3 h-3 opacity-70" />
                              )
                            )}
                          </div>
                          
                          {/* Delete Button (Hover) */}
                          {isMe && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingMessageId(msg.id);
                              }}
                              className={cn(
                                "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white dark:bg-slate-800 shadow-md rounded-full text-slate-400 hover:text-red-500 z-20",
                                "-left-10"
                              )}
                              title="Delete Message"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Report Button (Hover) */}
                          {!isMe && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReportingMessageId(msg.id);
                              }}
                              className={cn(
                                "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white dark:bg-slate-800 shadow-md rounded-full text-slate-400 hover:text-red-500 z-20",
                                "-right-10"
                              )}
                              title="Report Message"
                            >
                              <Flag className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      
                      {/* Display Reactions */}
                      {Object.keys(reactionCounts).length > 0 && (
                        <div className={cn(
                          "flex flex-wrap gap-1 mt-1",
                          isMe ? "justify-end" : "justify-start"
                        )}>
                          {Object.entries(reactionCounts).map(([emoji, { count, me }]) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className={cn(
                                "text-[11px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border transition-colors",
                                me ? "bg-indigo-50 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                              )}
                            >
                              <span>{emoji}</span>
                              <span className="font-medium">{count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
                );
              })}
              {(() => {
                const activeChatTypingUsers = currentActiveChat ? Object.values(typingUsers[currentActiveChat.id] || {}) : [];
                if (activeChatTypingUsers.length === 0) return null;
                
                let typingText = '';
                if (activeChatTypingUsers.length === 1) {
                  typingText = `${activeChatTypingUsers[0]} is typing...`;
                } else if (activeChatTypingUsers.length === 2) {
                  typingText = `${activeChatTypingUsers[0]} and ${activeChatTypingUsers[1]} are typing...`;
                } else {
                  typingText = 'Several people are typing...';
                }

                return (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm italic px-4 py-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    {typingText}
                  </div>
                );
              })()}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-slate-900 z-10 border-t border-slate-100 dark:border-slate-800 transition-colors duration-300">
              <form onSubmit={sendMessage} className="flex items-end gap-2 max-w-4xl mx-auto">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
                >
                  <Paperclip className="w-6 h-6" />
                </button>
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-end min-h-[52px]">
                  <button type="button" className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <Smile className="w-6 h-6" />
                  </button>
                  <input
                    type="text"
                    value={messageInput}
                    onChange={handleTyping}
                    placeholder="Write a message..."
                    className="flex-1 bg-transparent py-3 px-2 focus:outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
                {messageInput.trim() ? (
                  <button 
                    type="submit" 
                    className="p-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors shadow-md flex-shrink-0"
                  >
                    <Send className="w-6 h-6 ml-0.5" />
                  </button>
                ) : (
                  <button type="button" className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex-shrink-0">
                    <div className="w-6 h-6 rounded-full border-2 border-current" />
                  </button>
                )}
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center z-10">
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm px-6 py-2 rounded-full text-slate-500 dark:text-slate-400 text-sm font-medium shadow-sm border border-white/20 dark:border-slate-700/50">
              Select a chat to start messaging
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingMessageId && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-6 border border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Delete Message</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">Are you sure you want to delete this message? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingMessageId(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteMessage}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportingMessageId && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Report Message</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Help us understand what's wrong with this message.</p>
            </div>
            <form onSubmit={submitReport} className="p-6">
              <div className="space-y-3 mb-6">
                {['Spam', 'Harassment', 'Inappropriate Content', 'Hate Speech', 'Other'].map((type) => (
                  <label key={type} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="reportType"
                      value={type}
                      checked={reportType === type}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{type}</span>
                  </label>
                ))}
              </div>

              {reportType === 'Other' && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Additional Details</label>
                  <textarea
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24 text-sm"
                    placeholder="Please provide more information..."
                    required={reportType === 'Other'}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReportingMessageId(null);
                    setReportReason('');
                    setReportType('Spam');
                  }}
                  className="px-6 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  disabled={isReporting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReporting}
                  className="px-6 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isReporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Reporting...
                    </>
                  ) : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showReportSuccess && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-3 animate-bounce">
          <Flag className="w-5 h-5 text-red-400" />
          <span className="font-medium">Message reported successfully</span>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create Group Chat</h2>
            </div>
            
            <form onSubmit={createGroup} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Group Name</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="E.g. Weekend Trip"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Group Avatar URL (Optional)</label>
                  <input
                    type="url"
                    value={groupAvatar}
                    onChange={(e) => setGroupAvatar(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://example.com/avatar.png"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Select Members</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {contacts.map(contact => (
                      <div 
                        key={contact.id}
                        onClick={() => toggleContactSelection(contact.id)}
                        className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                          selectedContacts.includes(contact.id) ? "bg-indigo-500 border-indigo-500" : "border-slate-300 dark:border-slate-600"
                        )}>
                          {selectedContacts.includes(contact.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <img src={contact.avatar} alt={contact.username} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                        <span className="font-medium text-slate-800 dark:text-slate-200">{contact.username}</span>
                      </div>
                    ))}
                    {contacts.length === 0 && (
                      <p className="text-sm text-slate-500 italic">No contacts available.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!groupName.trim() || selectedContacts.length === 0}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Profile Info Modal */}
      {selectedUserProfile && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100 dark:border-slate-800">
            <div className="relative h-32 bg-indigo-500">
              <button 
                onClick={() => setSelectedUserProfile(null)}
                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors z-10"
              >
                <ArrowLeft className="w-5 h-5 rotate-90" />
              </button>
            </div>
            <div className="px-6 pb-8 -mt-16 relative">
              <div className="flex flex-col items-center text-center">
                <img 
                  src={selectedUserProfile.avatar} 
                  alt={selectedUserProfile.username} 
                  className="w-32 h-32 rounded-3xl border-4 border-white dark:border-slate-900 shadow-xl bg-white dark:bg-slate-800 object-cover mb-4"
                />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selectedUserProfile.username}</h2>
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm mt-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Available</span>
                </div>
              </div>

              <div className="mt-8 space-y-6">
                {selectedUserProfile.bio && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Info className="w-3.5 h-3.5" /> About
                    </h3>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{selectedUserProfile.bio}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {selectedUserProfile.location && (
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Location</span>
                        <span className="text-sm font-medium">{selectedUserProfile.location}</span>
                      </div>
                    </div>
                  )}
                  {selectedUserProfile.website && (
                    <a 
                      href={selectedUserProfile.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Website</span>
                        <span className="text-sm font-medium truncate max-w-[120px]">Visit Site</span>
                      </div>
                    </a>
                  )}
                </div>

                {selectedUserProfile.joined_at && (
                  <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 text-xs pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Member since {format(new Date(selectedUserProfile.joined_at), 'MMMM yyyy')}</span>
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setSelectedUserProfile(null)}
                  className="flex-1 py-3 bg-indigo-500 text-white rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showGroupSettings && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Group Settings</h2>
              <button onClick={() => setShowGroupSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-6">
                <form onSubmit={saveGroupSettings} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Group Name</label>
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Group Avatar URL</label>
                    <input
                      type="url"
                      value={editGroupAvatar}
                      onChange={(e) => setEditGroupAvatar(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Members ({groupMembers.length})</h3>
                    <button 
                      onClick={openAddMembers}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                    >
                      + Add Member
                    </button>
                  </div>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                    {groupMembers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
                        <div className="flex items-center gap-3">
                          <img src={member.avatar} alt={member.username} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{member.username}</span>
                        </div>
                        {member.id !== currentUser?.id && (
                          <button 
                            onClick={() => removeGroupMember(member.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Remove Member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMembers && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh] border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Add Members</h2>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-2">
                {contacts.map(contact => (
                  <div 
                    key={contact.id}
                    onClick={() => toggleContactSelection(contact.id)}
                    className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                  >
                    <div className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                      selectedContacts.includes(contact.id) ? "bg-indigo-500 border-indigo-500" : "border-slate-300 dark:border-slate-600"
                    )}>
                      {selectedContacts.includes(contact.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <img src={contact.avatar} alt={contact.username} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">{contact.username}</span>
                  </div>
                ))}
                {contacts.length === 0 && (
                  <p className="text-sm text-slate-500 italic text-center py-4">No other contacts available to add.</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowAddMembers(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addMembersToGroup}
                disabled={selectedContacts.length === 0}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Call Overlay */}
      {callStatus !== 'idle' && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
          {callStatus === 'receiving' && incomingCall ? (
            <div className="text-center">
              <div className="relative w-32 h-32 mx-auto mb-6">
                {incomingCall.senderAvatar ? (
                  <img src={incomingCall.senderAvatar} alt={incomingCall.senderName} className="w-32 h-32 rounded-full border-4 border-indigo-500 animate-pulse" />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-indigo-500 flex items-center justify-center text-white text-4xl font-bold border-4 border-indigo-400 animate-pulse">
                    {incomingCall.senderName.charAt(0)}
                  </div>
                )}
              </div>
              <h2 className="text-white text-3xl font-semibold mb-2">{incomingCall.senderName}</h2>
              <p className="text-slate-300 mb-12">Incoming {incomingCall.callType === 'audio' ? 'audio' : incomingCall.callType === 'video-only' ? 'video-only' : 'video'} call...</p>
              <div className="flex justify-center gap-8">
                <button 
                  onClick={rejectCall}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg hover:shadow-red-500/25"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
                <button 
                  onClick={acceptCall}
                  className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white hover:bg-green-600 transition-colors shadow-lg hover:shadow-green-500/25 animate-bounce"
                >
                  {incomingCall.callType === 'audio' ? <Phone className="w-8 h-8" /> : <Video className="w-8 h-8" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full max-w-6xl max-h-[800px] p-4 flex flex-col relative">
              <div className="flex-1 relative bg-black rounded-2xl overflow-hidden shadow-2xl">
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className={cn("w-full h-full object-cover", callType === 'audio' && "hidden")}
                />
                {callType === 'audio' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
                    <div className="w-32 h-32 rounded-full bg-indigo-500 flex items-center justify-center text-white text-4xl font-bold mb-4">
                      {currentActiveChat?.name.charAt(0)}
                    </div>
                    <p className="text-white text-xl font-medium">{currentActiveChat?.name}</p>
                    <p className="text-slate-400 mt-2">Audio Call</p>
                  </div>
                )}
                
                {callStatus === 'calling' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
                    <div className="w-24 h-24 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4 animate-ping">
                      {callType === 'audio' ? <Phone className="w-10 h-10 text-indigo-400" /> : <Video className="w-10 h-10 text-indigo-400" />}
                    </div>
                    <p className="text-white text-xl font-medium">Calling...</p>
                  </div>
                )}

                <div className={cn(
                  "absolute bottom-6 right-6 w-48 aspect-[3/4] bg-slate-800 rounded-xl overflow-hidden shadow-xl border-2 border-slate-700",
                  callType === 'audio' && "hidden"
                )}>
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={cn(
                      "w-full h-full object-cover",
                      isVideoOff && "hidden",
                      isLocalVideoFlipped && "-scale-x-100"
                    )}
                  />
                  {isVideoOff && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                      <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xl font-bold">
                        {currentUser.username.charAt(0)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-24 mt-4 flex items-center justify-center gap-6">
                {callType !== 'video-only' && (
                  <button 
                    onClick={toggleMute}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg",
                      isMuted ? "bg-red-500 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-600"
                    )}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                )}
                {callType !== 'audio' && (
                  <button 
                    onClick={toggleVideo}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg",
                      isVideoOff ? "bg-red-500 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-600"
                    )}
                    title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                  >
                    {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </button>
                )}
                {callType !== 'audio' && (
                  <button 
                    onClick={() => setIsLocalVideoFlipped(!isLocalVideoFlipped)}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg",
                      isLocalVideoFlipped ? "bg-indigo-500 hover:bg-indigo-600" : "bg-slate-700 hover:bg-slate-600"
                    )}
                    title={isLocalVideoFlipped ? "Unflip Video" : "Flip Video Horizontally"}
                  >
                    <FlipHorizontal className="w-6 h-6" />
                  </button>
                )}
                <button 
                  onClick={endCall}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/25 mx-2"
                  title="End Call"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
                {callType !== 'video-only' && (
                  <button 
                    onClick={toggleRemoteMute}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg",
                      isRemoteMuted ? "bg-red-500 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-600"
                    )}
                    title={isRemoteMuted ? "Unmute Speaker" : "Mute Speaker"}
                  >
                    {isRemoteMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
