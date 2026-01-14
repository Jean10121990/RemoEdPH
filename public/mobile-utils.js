/**
 * Mobile Utilities for RemoEdPH Teacher Portal
 * Provides swipe gestures, mobile notifications, and responsive enhancements
 */

// Mobile Detection
const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           (window.innerWidth <= 768);
};

// Touch/Swipe Gesture Handler
class SwipeHandler {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            threshold: 50, // Minimum distance for swipe
            timeout: 300, // Maximum time for swipe
            preventDefault: true,
            ...options
        };
        
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.isSwipe = false;
        
        this.init();
    }
    
    init() {
        this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    }
    
    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchStartTime = Date.now();
        this.isSwipe = false;
    }
    
    handleTouchMove(e) {
        if (this.options.preventDefault) {
            e.preventDefault();
        }
    }
    
    handleTouchEnd(e) {
        if (!this.touchStartX || !this.touchStartY) return;
        
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        const deltaTime = Date.now() - this.touchStartTime;
        
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        
        // Check if it's a swipe (horizontal movement is greater than vertical)
        if (absX > absY && absX > this.options.threshold && deltaTime < this.options.timeout) {
            this.isSwipe = true;
            
            if (deltaX > 0) {
                // Swipe right
                this.onSwipeRight && this.onSwipeRight(e, deltaX);
            } else {
                // Swipe left
                this.onSwipeLeft && this.onSwipeLeft(e, absX);
            }
        } else if (absY > absX && absY > this.options.threshold && deltaTime < this.options.timeout) {
            this.isSwipe = true;
            
            if (deltaY > 0) {
                // Swipe down
                this.onSwipeDown && this.onSwipeDown(e, deltaY);
            } else {
                // Swipe up
                this.onSwipeUp && this.onSwipeUp(e, absY);
            }
        }
        
        // Reset
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
    }
    
    onSwipeRight(callback) {
        this.onSwipeRight = callback;
        return this;
    }
    
    onSwipeLeft(callback) {
        this.onSwipeLeft = callback;
        return this;
    }
    
    onSwipeUp(callback) {
        this.onSwipeUp = callback;
        return this;
    }
    
    onSwipeDown(callback) {
        this.onSwipeDown = callback;
        return this;
    }
    
    destroy() {
        this.element.removeEventListener('touchstart', this.handleTouchStart);
        this.element.removeEventListener('touchmove', this.handleTouchMove);
        this.element.removeEventListener('touchend', this.handleTouchEnd);
    }
}

// Mobile Sidebar Manager
class MobileSidebar {
    constructor() {
        this.sidebar = null;
        this.overlay = null;
        this.isOpen = false;
        this.init();
    }
    
    init() {
        if (!isMobile()) return;
        
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'mobile-sidebar-overlay';
        this.overlay.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 99;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);
        
        // Find sidebar
        this.sidebar = document.querySelector('.remoed-sidebar');
        if (this.sidebar) {
            this.setupSidebar();
            this.createHamburgerButton();
        }
    }
    
    setupSidebar() {
        this.sidebar.style.cssText += `
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 100;
        `;
    }
    
    createHamburgerButton() {
        const hamburger = document.createElement('button');
        hamburger.className = 'mobile-hamburger';
        hamburger.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        `;
        hamburger.style.cssText = `
            display: none;
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 101;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            width: 44px;
            height: 44px;
            padding: 10px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        
        if (isMobile()) {
            hamburger.style.display = 'flex';
            hamburger.style.alignItems = 'center';
            hamburger.style.justifyContent = 'center';
        }
        
        hamburger.addEventListener('click', () => this.toggle());
        document.body.appendChild(hamburger);
        this.hamburger = hamburger;
    }
    
    open() {
        if (!this.sidebar) return;
        this.isOpen = true;
        this.sidebar.style.transform = 'translateX(0)';
        this.overlay.style.display = 'block';
        setTimeout(() => {
            this.overlay.style.opacity = '1';
        }, 10);
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        if (!this.sidebar) return;
        this.isOpen = false;
        this.sidebar.style.transform = 'translateX(-100%)';
        this.overlay.style.opacity = '0';
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 300);
        document.body.style.overflow = '';
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}

// Mobile Notifications Manager
class MobileNotifications {
    constructor() {
        this.permission = null;
        this.serviceWorkerRegistration = null;
        this.init();
    }
    
    async init() {
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return;
        }
        
        this.permission = Notification.permission;
        
        // Request permission if not granted
        if (this.permission === 'default') {
            this.requestPermission();
        }
        
        // Register service worker for push notifications
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                this.serviceWorkerRegistration = registration;
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }
    
    async requestPermission() {
        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            if (permission === 'granted') {
                this.showNotification('Notifications Enabled', {
                    body: 'You will now receive important updates',
                    icon: '/favicon.ico',
                    badge: '/favicon.ico'
                });
            }
            
            return permission;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return 'denied';
        }
    }
    
    showNotification(title, options = {}) {
        if (this.permission !== 'granted') {
            console.log('Notification permission not granted');
            return;
        }
        
        const notificationOptions = {
            body: options.body || '',
            icon: options.icon || '/favicon.ico',
            badge: options.badge || '/favicon.ico',
            tag: options.tag || 'default',
            requireInteraction: options.requireInteraction || false,
            ...options
        };
        
        if (this.serviceWorkerRegistration) {
            this.serviceWorkerRegistration.showNotification(title, notificationOptions);
        } else {
            new Notification(title, notificationOptions);
        }
    }
    
    // Notification types for common events
    notifyNewBooking(bookingData) {
        this.showNotification('New Booking Received', {
            body: `You have a new booking from ${bookingData.studentName || 'a student'}`,
            tag: 'new-booking',
            requireInteraction: true,
            data: bookingData
        });
    }
    
    notifyClassReminder(bookingData) {
        this.showNotification('Class Starting Soon', {
            body: `Your class with ${bookingData.studentName || 'student'} starts in 15 minutes`,
            tag: 'class-reminder',
            requireInteraction: true,
            data: bookingData
        });
    }
    
    notifyCancellation(cancellationData) {
        this.showNotification('Booking Cancelled', {
            body: `A booking has been cancelled`,
            tag: 'cancellation',
            data: cancellationData
        });
    }
    
    notifyPayment(paymentData) {
        this.showNotification('Payment Received', {
            body: `You have received a payment of ₱${paymentData.amount || '0'}`,
            tag: 'payment',
            data: paymentData
        });
    }
}

// Quick Actions Manager (for swipe gestures on list items)
class QuickActions {
    constructor(containerSelector, options = {}) {
        this.container = document.querySelector(containerSelector);
        this.options = {
            swipeThreshold: 50,
            actionButtons: ['delete', 'edit', 'archive'],
            ...options
        };
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        const items = this.container.querySelectorAll('[data-swipe-item]');
        items.forEach(item => {
            this.setupSwipeItem(item);
        });
    }
    
    setupSwipeItem(item) {
        const swipeHandler = new SwipeHandler(item, {
            threshold: this.options.swipeThreshold
        });
        
        swipeHandler.onSwipeLeft((e, distance) => {
            this.showActions(item);
        });
        
        swipeHandler.onSwipeRight((e, distance) => {
            this.hideActions(item);
        });
        
        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!item.contains(e.target)) {
                this.hideActions(item);
            }
        });
    }
    
    showActions(item) {
        // Remove active class from other items
        this.container.querySelectorAll('.swipe-item-active').forEach(activeItem => {
            if (activeItem !== item) {
                this.hideActions(activeItem);
            }
        });
        
        item.classList.add('swipe-item-active');
        item.style.transform = 'translateX(-80px)';
        
        // Create action buttons if they don't exist
        if (!item.querySelector('.swipe-actions')) {
            const actions = document.createElement('div');
            actions.className = 'swipe-actions';
            actions.innerHTML = `
                ${this.options.actionButtons.includes('edit') ? '<button class="swipe-action-btn edit" onclick="event.stopPropagation();">Edit</button>' : ''}
                ${this.options.actionButtons.includes('delete') ? '<button class="swipe-action-btn delete" onclick="event.stopPropagation();">Delete</button>' : ''}
                ${this.options.actionButtons.includes('archive') ? '<button class="swipe-action-btn archive" onclick="event.stopPropagation();">Archive</button>' : ''}
            `;
            item.appendChild(actions);
        }
    }
    
    hideActions(item) {
        item.classList.remove('swipe-item-active');
        item.style.transform = 'translateX(0)';
    }
}

// Pull to Refresh
class PullToRefresh {
    constructor(container, callback) {
        this.container = container;
        this.callback = callback;
        this.startY = 0;
        this.currentY = 0;
        this.isPulling = false;
        this.threshold = 80;
        
        this.init();
    }
    
    init() {
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.container.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    handleTouchStart(e) {
        if (this.container.scrollTop === 0) {
            this.startY = e.touches[0].clientY;
            this.isPulling = true;
        }
    }
    
    handleTouchMove(e) {
        if (!this.isPulling) return;
        
        this.currentY = e.touches[0].clientY;
        const pullDistance = this.currentY - this.startY;
        
        if (pullDistance > 0 && this.container.scrollTop === 0) {
            e.preventDefault();
            const pullRatio = Math.min(pullDistance / this.threshold, 1);
            this.container.style.transform = `translateY(${pullDistance}px)`;
            this.container.style.opacity = 1 - pullRatio * 0.3;
        }
    }
    
    handleTouchEnd(e) {
        if (!this.isPulling) return;
        
        const pullDistance = this.currentY - this.startY;
        
        if (pullDistance > this.threshold) {
            // Trigger refresh
            this.callback && this.callback();
        }
        
        // Reset
        this.container.style.transform = '';
        this.container.style.opacity = '';
        this.isPulling = false;
        this.startY = 0;
        this.currentY = 0;
    }
}

// Initialize mobile features
function initMobileFeatures() {
    if (!isMobile()) return;
    
    // Initialize mobile sidebar
    window.mobileSidebar = new MobileSidebar();
    
    // Initialize notifications
    window.mobileNotifications = new MobileNotifications();
    
    // Add mobile-specific styles
    addMobileStyles();
    
    // Close sidebar when clicking menu items
    document.querySelectorAll('.remoed-menu li').forEach(item => {
        item.addEventListener('click', () => {
            if (window.mobileSidebar) {
                window.mobileSidebar.close();
            }
        });
    });
}

// Add mobile-specific CSS
function addMobileStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Mobile Sidebar Styles */
        @media (max-width: 768px) {
            .remoed-sidebar {
                width: 280px !important;
                max-width: 80vw !important;
            }
            
            .remoed-content {
                margin-left: 0 !important;
                padding: 16px !important;
            }
            
            /* Swipe Item Styles */
            .swipe-item {
                position: relative;
                transition: transform 0.3s ease;
                overflow: hidden;
            }
            
            .swipe-actions {
                position: absolute;
                right: 0;
                top: 0;
                bottom: 0;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 0 16px;
                background: #f8f9fa;
            }
            
            .swipe-action-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
            }
            
            .swipe-action-btn.edit {
                background: #667eea;
                color: white;
            }
            
            .swipe-action-btn.delete {
                background: #e74c3c;
                color: white;
            }
            
            .swipe-action-btn.archive {
                background: #f59e0b;
                color: white;
            }
            
            /* Touch-friendly buttons */
            button, .btn, a {
                min-height: 44px;
                min-width: 44px;
            }
            
            /* Better spacing for mobile */
            .remoed-content > * {
                margin-bottom: 16px;
            }
            
            /* Larger touch targets */
            input, select, textarea {
                font-size: 16px !important; /* Prevents zoom on iOS */
                padding: 12px !important;
            }
        }
        
        /* Tablet adjustments */
        @media (min-width: 769px) and (max-width: 1024px) {
            .remoed-sidebar {
                width: 240px !important;
            }
            
            .remoed-content {
                padding: 24px !important;
            }
        }
    `;
    document.head.appendChild(style);
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isMobile,
        SwipeHandler,
        MobileSidebar,
        MobileNotifications,
        QuickActions,
        PullToRefresh,
        initMobileFeatures
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileFeatures);
} else {
    initMobileFeatures();
}
