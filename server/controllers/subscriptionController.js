const Subscription = require('../models/Subscription');
const User = require('../models/User');

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

module.exports = {
    createSubscription
};