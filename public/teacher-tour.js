// AI-Powered Teacher Portal Tour
class TeacherPortalTour {
    constructor() {
        this.currentStep = 0;
        this.tourSteps = [
            {
                element: '.remoed-sidebar',
                title: 'Welcome to RemoEdPH! 👋',
                content: 'This is your navigation sidebar. Use it to access different sections of your teacher portal.',
                position: 'right'
            },
            {
                element: '.remoed-menu li:first-child',
                title: 'Dashboard',
                content: 'Your dashboard shows your performance metrics, upcoming classes, and quick stats.',
                position: 'right'
            },
            {
                element: '.remoed-menu li:nth-child(2)',
                title: 'Class Schedule',
                content: 'View and manage your class schedule. See all your upcoming and past classes here.',
                position: 'right'
            },
            {
                element: '.remoed-menu li:nth-child(6)',
                title: 'Performance Indicator',
                content: 'Track your achievements and earn badges! See how you\'re performing and what you can improve.',
                position: 'right'
            },
            {
                element: '.remoed-menu li:last-child',
                title: 'Profile',
                content: 'Manage your profile, teaching abilities, and access support resources.',
                position: 'right'
            }
        ];
        this.tourActive = false;
    }
    
    startTour() {
        if (this.tourActive) {
            this.endTour();
            return;
        }
        
        this.tourActive = true;
        this.currentStep = 0;
        this.showStep(0);
        
        // Add tour overlay
        this.createOverlay();
    }
    
    createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'tour-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            pointer-events: none;
        `;
        document.body.appendChild(overlay);
    }
    
    showStep(stepIndex) {
        if (stepIndex >= this.tourSteps.length) {
            this.endTour();
            return;
        }
        
        const step = this.tourSteps[stepIndex];
        const element = document.querySelector(step.element);
        
        if (!element) {
            // Skip if element not found, go to next step
            this.currentStep++;
            setTimeout(() => this.showStep(this.currentStep), 300);
            return;
        }
        
        // Remove existing tour elements first
        const existingTooltip = document.getElementById('tour-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        const existingHighlight = document.getElementById('tour-highlight');
        if (existingHighlight) {
            existingHighlight.remove();
        }
        
        // Highlight element
        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.id = 'tour-highlight';
        highlight.style.cssText = `
            position: fixed;
            top: ${rect.top - 5}px;
            left: ${rect.left - 5}px;
            width: ${rect.width + 10}px;
            height: ${rect.height + 10}px;
            border: 3px solid #667eea;
            border-radius: 8px;
            background: rgba(102, 126, 234, 0.1);
            z-index: 9999;
            pointer-events: none;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        `;
        document.body.appendChild(highlight);
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'tour-tooltip';
        const position = step.position || 'bottom';
        
        let top, left;
        if (position === 'right') {
            top = rect.top + window.scrollY;
            left = rect.right + 20;
        } else if (position === 'left') {
            top = rect.top + window.scrollY;
            left = rect.left - 320;
        } else if (position === 'top') {
            top = rect.top + window.scrollY - 150;
            left = rect.left;
        } else {
            top = rect.bottom + window.scrollY + 20;
            left = rect.left;
        }
        
        tooltip.style.cssText = `
            position: absolute;
            top: ${top}px;
            left: ${left}px;
            width: 300px;
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            z-index: 10000;
        `;
        
        tooltip.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #667eea; font-size: 1.2rem;">${step.title}</h3>
            <p style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">${step.content}</p>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #999; font-size: 0.9rem;">Step ${stepIndex + 1} of ${this.tourSteps.length}</span>
                <div style="display: flex; gap: 10px;">
                    ${stepIndex > 0 ? '<button id="tour-prev" style="padding: 8px 16px; border: 2px solid #667eea; background: white; color: #667eea; border-radius: 6px; cursor: pointer; font-weight: 600;">Previous</button>' : ''}
                    <button id="tour-next" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        ${stepIndex === this.tourSteps.length - 1 ? 'Finish' : 'Next'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(tooltip);
        
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Event listeners - use setTimeout to ensure elements exist
        setTimeout(() => {
            const nextBtn = document.getElementById('tour-next');
            if (nextBtn) {
                // Remove any existing event listeners first
                const newNextBtn = nextBtn.cloneNode(true);
                nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
                
                newNextBtn.addEventListener('click', () => {
                    // Check if this is the last step
                    if (stepIndex === this.tourSteps.length - 1) {
                        // This is the Finish button
                        this.endTour();
                        return;
                    }
                    
                    // Remove existing highlight before moving to next step
                    const existingHighlight = document.getElementById('tour-highlight');
                    if (existingHighlight) {
                        existingHighlight.remove();
                    }
                    this.currentStep++;
                    this.showStep(this.currentStep);
                });
            }
            
            if (stepIndex > 0) {
                const prevBtn = document.getElementById('tour-prev');
                if (prevBtn) {
                    // Remove any existing event listeners first
                    const newPrevBtn = prevBtn.cloneNode(true);
                    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
                    
                    newPrevBtn.addEventListener('click', () => {
                        // Remove existing highlight before moving to previous step
                        const existingHighlight = document.getElementById('tour-highlight');
                        if (existingHighlight) {
                            existingHighlight.remove();
                        }
                        this.currentStep--;
                        this.showStep(this.currentStep);
                    });
                }
            }
        }, 100);
    }
    
    endTour() {
        this.tourActive = false;
        
        // Remove all tour elements more aggressively
        const tourElements = [
            'tour-overlay',
            'tour-highlight',
            'tour-tooltip'
        ];
        
        tourElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.remove();
            }
        });
        
        // Also remove by class or any other tour-related elements
        const allTourElements = document.querySelectorAll('[id^="tour-"]');
        allTourElements.forEach(el => el.remove());
        
        // Force remove any elements with tour-related styles
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.style && el.style.boxShadow && el.style.boxShadow.includes('9999px')) {
                el.remove();
            }
        });
        
        // Save tour completion
        localStorage.setItem('teacherTourCompleted', 'true');
    }
    
    // Cleanup function to remove any leftover tour elements
    cleanup() {
        this.endTour();
    }
}

// Initialize tour
const teacherTour = new TeacherPortalTour();

// Add tour button to dashboard
function addTourButton() {
    // Check if tour was already completed
    const tourCompleted = localStorage.getItem('teacherTourCompleted');
    
    // Create floating tour button
    const tourButton = document.createElement('button');
    tourButton.id = 'tour-button';
    tourButton.innerHTML = '🤖 Start Tour';
    tourButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 25px;
        cursor: pointer;
        font-weight: 600;
        font-size: 1rem;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        z-index: 1000;
        transition: transform 0.3s ease;
    `;
    
    tourButton.addEventListener('click', () => {
        teacherTour.startTour();
    });
    
    tourButton.addEventListener('mouseenter', () => {
        tourButton.style.transform = 'scale(1.05)';
    });
    
    tourButton.addEventListener('mouseleave', () => {
        tourButton.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(tourButton);
    
    // Show welcome message if first time
    if (!tourCompleted) {
        setTimeout(() => {
            if (confirm('Welcome to RemoEdPH! Would you like to take a quick tour of the teacher portal?')) {
                teacherTour.startTour();
            }
        }, 1000);
    }
}

// Cleanup function to remove any leftover tour elements on page load
function cleanupTourElements() {
    const tourElements = [
        'tour-overlay',
        'tour-highlight',
        'tour-tooltip'
    ];
    
    tourElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    });
    
    // Remove any elements with the massive box-shadow
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
        if (el.style && el.style.boxShadow && el.style.boxShadow.includes('9999px')) {
            el.remove();
        }
    });
}

// Clean up on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        cleanupTourElements();
        addTourButton();
    });
} else {
    cleanupTourElements();
    addTourButton();
}

// Also add escape key handler to exit tour
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && teacherTour.tourActive) {
        teacherTour.endTour();
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    teacherTour.cleanup();
});
