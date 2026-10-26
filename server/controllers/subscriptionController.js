const Subscription = require('../models/Subscription');
const User = require('../models/User');
const whatsappClient = require('../utils/whatsappBot'); // Added for the automated receipt

// Helper function to calculate exact 28-day cycles
const calculateEndDate = (startDate, planType) => {
    const start = new Date(startDate);
    
    // 1 Month = 4 weeks = 28 days
    // 3 Months = 12 weeks = 84 days
    // 6 Months = 24 weeks = 168 days
    // 12 Months = 48 weeks = 336 days
    let daysToAdd = 28; 

    if (planType === 'quarterly') daysToAdd = 84;
    if (planType === 'semi-annual') daysToAdd = 168;
    if (planType === 'annual') daysToAdd = 336;

    // Add the exact number of days
    start.setDate(start.getDate() + daysToAdd);
    return start;
};

// @desc    Create a new student subscription
// @route   POST /api/subscriptions
// @access  Admin
const createSubscription = async (req, res) => {
    try {
        const { studentId, planType, totalClasses, startDate, pricePaid } = req.body;

        // 1. Calculate the exact renewal date based on your 28-day rule
        const exactEndDate = calculateEndDate(startDate, planType);

        // 2. Create the subscription in the database
        const newSubscription = await Subscription.create({
            student: studentId,
            totalClasses: totalClasses,
            classesUsed: 0, 
            startDate: startDate,
            endDate: exactEndDate, // This is your Renewal Date
            pricePaid: pricePaid,
            active: true
        });

        // 3. Update the User (Student) profile to show they are active
        await User.findByIdAndUpdate(studentId, {
            'subscription.status': 'active',
            'subscription.startDate': startDate,
            'subscription.endDate': exactEndDate,
            'subscription.totalClassesBought': totalClasses
        });

        res.status(201).json({
            message: 'Subscription created successfully!',
            subscription: newSubscription
        });

    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({ message: 'Server error while creating subscription' });
    }
};

// @desc    Get logged-in student's subscription and makeup summary
// @route   GET /api/subscriptions/my-summary
// @access  Private (Student)
const getStudentSubscriptionSummary = async (req, res) => {
    try {
        // req.user._id comes from your auth middleware
        const studentId = req.user._id;

        // 1. Fetch the active subscription (the virtual field handles remainingClasses automatically)
        const subscription = await Subscription.findOne({ 
            student: studentId, 
            active: true 
        }).sort({ createdAt: -1 });

        // 2. Fetch the student profile to check the makeup bank
        const student = await User.findById(studentId);

        if (!student) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        // 3. Filter the makeup bank to only show VALID credits (not used, not expired)
        const now = new Date();
        const activeMakeups = student.makeupBank.filter(
            (credit) => !credit.isUsed && new Date(credit.expirationDate) > now
        );

        // 4. Send the clean package to the frontend
        res.status(200).json({
            subscription: subscription || null,
            activeMakeups: activeMakeups,
            makeupCount: activeMakeups.length
        });

    } catch (error) {
        console.error('Error fetching subscription summary:', error);
        res.status(500).json({ message: 'Server error while fetching summary' });
    }
};

// ==========================================
// ✨ NEW: PAYPAL LINKING & WEBHOOK LOGIC
// ==========================================

// @desc    Link a PayPal ID to a student
// @route   POST /api/subscriptions/link
// @access  Private (Admin)
const linkPayPalBilling = async (req, res) => {
    try {
        const { userId, billingType, subscriptionId, recurringSeriesId, invoiceId } = req.body;
        const user = await User.findById(userId);
        
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.paypal) user.paypal = {};
        user.paypal.billingType = billingType;
        
        if (subscriptionId) user.paypal.subscriptionId = subscriptionId;
        if (recurringSeriesId) user.paypal.recurringSeriesId = recurringSeriesId;
        if (invoiceId) user.paypal.invoiceId = invoiceId;

        await user.save();
        res.status(200).json({ message: 'PayPal billing method linked successfully', user });
    } catch (error) {
        console.error('Error linking PayPal:', error);
        res.status(500).json({ message: 'Server error while linking PayPal' });
    }
};

// @desc    Handle incoming PayPal Webhooks
// @route   POST /api/subscriptions/webhook
// @access  Public (Called securely by PayPal)
const paypalWebhookHandler = async (req, res) => {
    // 1. Acknowledge receipt to PayPal immediately so they don't retry the ping
    res.status(200).send('Webhook received');

    try {
        const event = req.body;
        const eventType = event.event_type;
        const resource = event.resource;

        let searchId = null;

        // 2. Identify if this is a Subscription (I-...) or an Invoice (INV2-...)
        if (eventType === 'PAYMENT.SALE.COMPLETED' || eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
            searchId = resource.billing_agreement_id || resource.id; 
        } else if (eventType === 'INVOICING.INVOICE.PAID' || eventType === 'PAYMENT.INVOICE.PAID') {
            searchId = resource.invoice?.id || resource.id; 
        }

        if (!searchId) return; // Exit if it's an irrelevant event type

        // 3. Find the student via their exact PayPal ID
        const user = await User.findOne({
            $or: [
                { 'paypal.subscriptionId': searchId },
                { 'paypal.invoiceId': searchId },
                { 'paypal.recurringSeriesId': searchId }
            ]
        });

        if (!user) {
            console.log(`Webhook Error: Payment received but no student found matching PayPal ID: ${searchId}`);
            return;
        }

        // 4. Auto-Renew the Cycle (Roll forward 28 days & Reset Phase 1)
        const now = new Date();
        const endDate = new Date(now.getTime() + (28 * 24 * 60 * 60 * 1000));

        user.subscription.startDate = now;
        user.subscription.endDate = endDate;
        user.subscription.classesUsed = 0; // Fresh 28-day cycle reset

        if (!user.paypal) user.paypal = {};
        user.paypal.status = 'active';

        await user.save();

        // 5. Send Automated WhatsApp Receipt to the Student or their Group
        try {
            if (whatsappClient && whatsappClient.sendMessage) {
                const target = user.studentGroupId || `${user.whatsappNumber}@c.us`;
                
                if (target && target !== '@c.us') {
                    const msg = `🎉 *Payment Received!*\n\nYour ${user.paypal.billingType === 'subscription' ? 'subscription' : 'invoice'} has successfully renewed.\n\n*New Cycle:* ${now.toLocaleDateString()} to ${endDate.toLocaleDateString()}\n*Phase 1 (Classes Completed):* 0\n\nThank you for choosing Learn With Ayman!`;
                    await whatsappClient.sendMessage(target, msg);
                }
            }
        } catch (botError) {
            console.log('WhatsApp Bot failed to send receipt:', botError.message);
        }

    } catch (error) {
        console.error('PayPal Webhook processing error:', error);
    }
};

module.exports = {
    createSubscription,
    getStudentSubscriptionSummary,
    linkPayPalBilling,
    paypalWebhookHandler
};